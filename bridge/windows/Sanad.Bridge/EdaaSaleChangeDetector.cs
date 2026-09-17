using System;
using System.Collections.Generic;
using System.Data.SqlClient;
using System.Globalization;
using System.Web.Script.Serialization;

namespace Sanad.Bridge
{
    internal static class EdaaSaleChangeDetector
    {
        public static int Run(string[] args)
        {
            Console.WriteLine("SANAD Bridge local sale change detector");
            Console.WriteLine("Mode: READ-ONLY Edaa + revision-aware durable SQLite outbox");
            Console.WriteLine();

            var discovery = EdaaDiscoveryService.Discover();
            Console.WriteLine("Edaa database : " + discovery.DatabaseName);
            Console.WriteLine("Source key    : " + discovery.SourceKey);

            using (var connection = new SqlConnection(discovery.CreateDatabaseConnectionString()))
            using (var state = new BridgeStateStore())
            {
                connection.Open();
                var currentMax = ReadMaxInvoiceId(connection);
                var watermark = state.GetSaleWatermark(discovery.SourceKey);

                if (!watermark.HasValue)
                {
                    state.InitializeSaleWatermark(discovery.SourceKey, currentMax);
                    Console.WriteLine();
                    Console.WriteLine("Bootstrap watermark initialized at invoice ID " + currentMax + ".");
                    Console.WriteLine("Historical invoices were intentionally NOT queued.");
                    Console.WriteLine("Create a new sale in Edaa, then run --local-scan again.");
                    Console.WriteLine("Local state: " + BridgeStateStore.DatabasePath);
                    return 0;
                }

                Console.WriteLine("Watermark     : " + watermark.Value);
                Console.WriteLine("Current max   : " + currentMax);

                var invoiceIds = ReadInvoiceIdsAfter(connection, watermark.Value, 100);
                if (invoiceIds.Count == 0)
                {
                    Console.WriteLine();
                    Console.WriteLine("No new sale invoices detected.");
                    Console.WriteLine("Pending sale outbox events: " + state.CountPendingSaleEvents(discovery.SourceKey));
                    return 0;
                }

                var serializer = new JavaScriptSerializer { MaxJsonLength = int.MaxValue, RecursionLimit = 300 };
                var queued = 0;

                foreach (var invoiceId in invoiceIds)
                {
                    var built = EdaaTransactionEnvelopeV1.Build(discovery, connection, invoiceId);
                    if (built == null)
                        continue;

                    var json = serializer.Serialize(built.Envelope);
                    if (state.QueueSaleBundle(discovery.SourceKey, invoiceId, built.Revision, built.EventId, json))
                    {
                        queued++;
                        Console.WriteLine("Queued invoice " + invoiceId + " revision " + built.Revision.Substring(0, 12) + " as " + built.EventId);
                        Console.WriteLine("  sale/accounting/inventory lines: " + built.SaleLineCount + "/" + built.AccountingLineCount + "/" + built.InventoryLineCount);
                        Console.WriteLine("  integrity: accounting=" + built.AccountingBalanced.ToString().ToLowerInvariant() +
                                          ", inventory=" + built.InventoryBalanced.ToString().ToLowerInvariant() +
                                          ", links=" + (built.AccountingLinked && built.InventoryLinked).ToString().ToLowerInvariant());
                    }
                    else
                    {
                        Console.WriteLine("Invoice " + invoiceId + " revision already exists in the local outbox; watermark reconciled.");
                    }
                }

                Console.WriteLine();
                Console.WriteLine("Detected invoices : " + invoiceIds.Count);
                Console.WriteLine("Newly queued      : " + queued);
                Console.WriteLine("Pending outbox    : " + state.CountPendingSaleEvents(discovery.SourceKey));
                Console.WriteLine("New watermark     : " + state.GetSaleWatermark(discovery.SourceKey));
                Console.WriteLine("Local state       : " + BridgeStateStore.DatabasePath);
                Console.WriteLine();
                Console.WriteLine("No writes were performed against Edaa or SANAD Cloud.");
                return 0;
            }
        }

        private static long ReadMaxInvoiceId(SqlConnection connection)
        {
            using (var command = new SqlCommand("select isnull(max(ID), 0) from tblSellInvoice", connection))
            {
                command.CommandTimeout = 15;
                return Convert.ToInt64(command.ExecuteScalar(), CultureInfo.InvariantCulture);
            }
        }

        private static List<long> ReadInvoiceIdsAfter(SqlConnection connection, long watermark, int limit)
        {
            var result = new List<long>();
            var sql = "select top " + limit.ToString(CultureInfo.InvariantCulture) + " ID from tblSellInvoice where ID > @watermark order by ID";
            using (var command = new SqlCommand(sql, connection))
            {
                command.CommandTimeout = 15;
                command.Parameters.AddWithValue("@watermark", watermark);
                using (var reader = command.ExecuteReader())
                {
                    while (reader.Read())
                        result.Add(Convert.ToInt64(reader[0], CultureInfo.InvariantCulture));
                }
            }
            return result;
        }
    }
}
