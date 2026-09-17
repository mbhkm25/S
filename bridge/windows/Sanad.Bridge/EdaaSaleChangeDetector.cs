using System;
using System.Collections.Generic;
using System.Data.SqlClient;
using System.Globalization;
using System.Linq;
using System.Web.Script.Serialization;

namespace Sanad.Bridge
{
    internal static class EdaaSaleChangeDetector
    {
        private const int NewInvoiceBatchSize = 100;
        private const int DefaultReconcileWindow = 12;
        private const int MaxReconcileWindow = 100;

        public static int Run(string[] args)
        {
            var reconcileWindow = ParseReconcileWindow(args);

            Console.WriteLine("SANAD Bridge local sale change detector");
            Console.WriteLine("Mode: READ-ONLY Edaa + revision-aware durable SQLite outbox");
            Console.WriteLine("Reconcile window: last " + reconcileWindow + " observed sale(s)");
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
                    Console.WriteLine("Future scans will reconcile a bounded overlap to detect edits/deletes.");
                    Console.WriteLine("Local state: " + BridgeStateStore.DatabasePath);
                    return 0;
                }

                Console.WriteLine("Watermark     : " + watermark.Value);
                Console.WriteLine("Current max   : " + currentMax);

                var newInvoiceIds = ReadInvoiceIdsAfter(connection, watermark.Value, NewInvoiceBatchSize);
                var overlapInvoiceIds = ReadRecentInvoiceIdsAtOrBefore(connection, watermark.Value, reconcileWindow);
                var candidateIds = MergeOrdered(overlapInvoiceIds, newInvoiceIds);

                var serializer = new JavaScriptSerializer { MaxJsonLength = int.MaxValue, RecursionLimit = 300 };
                var queued = 0;
                var reconciled = 0;
                var unchanged = 0;
                var blockedAt = (long?)null;

                foreach (var invoiceId in candidateIds)
                {
                    var isNew = invoiceId > watermark.Value;
                    var built = EdaaTransactionEnvelopeV1.Build(discovery, connection, invoiceId);

                    if (built == null)
                    {
                        if (isNew)
                        {
                            // Never advance the watermark past a new invoice that cannot yet be materialized.
                            // This prevents a later invoice from causing a transient/missing row to be skipped forever.
                            blockedAt = invoiceId;
                            Console.WriteLine("New invoice " + invoiceId + " is not readable yet; scan stopped before advancing the watermark.");
                            break;
                        }

                        // Missing rows inside the overlap are not converted to tombstones automatically.
                        // Edaa normally exposes logical deletion through the Deleted flag, which is revision-hashed.
                        Console.WriteLine("Reconcile warning: invoice " + invoiceId + " is no longer readable; no tombstone was emitted.");
                        continue;
                    }

                    var json = serializer.Serialize(built.Envelope);
                    var inserted = state.QueueSaleBundle(discovery.SourceKey, invoiceId, built.Revision, built.EventId, json);
                    if (inserted)
                    {
                        queued++;
                        if (!isNew) reconciled++;

                        Console.WriteLine((isNew ? "Queued invoice " : "Reconciled invoice ") + invoiceId +
                                          " revision " + built.Revision.Substring(0, 12) + " as " + built.EventId);
                        Console.WriteLine("  sale/accounting/inventory lines: " + built.SaleLineCount + "/" + built.AccountingLineCount + "/" + built.InventoryLineCount);
                        Console.WriteLine("  integrity: accounting=" + built.AccountingBalanced.ToString().ToLowerInvariant() +
                                          ", inventory=" + built.InventoryBalanced.ToString().ToLowerInvariant() +
                                          ", links=" + (built.AccountingLinked && built.InventoryLinked).ToString().ToLowerInvariant());
                    }
                    else
                    {
                        unchanged++;
                    }
                }

                Console.WriteLine();
                Console.WriteLine("New invoices seen   : " + newInvoiceIds.Count);
                Console.WriteLine("Overlap checked     : " + overlapInvoiceIds.Count);
                Console.WriteLine("New revisions queued: " + queued);
                Console.WriteLine("Edited old invoices : " + reconciled);
                Console.WriteLine("Unchanged revisions : " + unchanged);
                Console.WriteLine("Pending outbox      : " + state.CountPendingSaleEvents(discovery.SourceKey));
                Console.WriteLine("New watermark       : " + state.GetSaleWatermark(discovery.SourceKey));
                if (blockedAt.HasValue)
                    Console.WriteLine("Blocked at invoice  : " + blockedAt.Value);
                Console.WriteLine("Local state         : " + BridgeStateStore.DatabasePath);
                Console.WriteLine();
                Console.WriteLine("Logical deletes/edits are detected when they change the revision inside the overlap window.");
                Console.WriteLine("Physical row disappearance is reported but is not yet emitted as a tombstone.");
                Console.WriteLine("No writes were performed against Edaa or SANAD Cloud.");
                return blockedAt.HasValue ? 24 : 0;
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

        private static List<long> ReadRecentInvoiceIdsAtOrBefore(SqlConnection connection, long watermark, int limit)
        {
            var result = new List<long>();
            if (limit <= 0 || watermark <= 0) return result;

            var sql = "select top " + limit.ToString(CultureInfo.InvariantCulture) +
                      " ID from tblSellInvoice where ID <= @watermark order by ID desc";
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

            result.Reverse();
            return result;
        }

        private static List<long> MergeOrdered(List<long> overlap, List<long> newer)
        {
            return overlap.Concat(newer).Distinct().OrderBy(value => value).ToList();
        }

        private static int ParseReconcileWindow(string[] args)
        {
            if (args == null) return DefaultReconcileWindow;
            for (var i = 0; i < args.Length; i++)
            {
                if (!string.Equals(args[i], "--reconcile-window", StringComparison.OrdinalIgnoreCase)) continue;
                if (i + 1 >= args.Length)
                    throw new ArgumentException("--reconcile-window requires a numeric value.");

                int value;
                if (!int.TryParse(args[i + 1], NumberStyles.Integer, CultureInfo.InvariantCulture, out value) || value < 0 || value > MaxReconcileWindow)
                    throw new ArgumentException("--reconcile-window must be between 0 and " + MaxReconcileWindow + ".");
                return value;
            }
            return DefaultReconcileWindow;
        }
    }
}
