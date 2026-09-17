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
        public static int Run(string[] args)
        {
            Console.WriteLine("SANAD Bridge local sale change detector");
            Console.WriteLine("Mode: READ-ONLY Edaa + durable local SQLite outbox");
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

                var serializer = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
                var queued = 0;

                foreach (var invoiceId in invoiceIds)
                {
                    var bundle = BuildBundle(discovery, connection, invoiceId);
                    if (bundle == null)
                        continue;

                    var json = serializer.Serialize(bundle);
                    var eventId = "edaa-sale:" + discovery.SourceKey + ":" + invoiceId.ToString(CultureInfo.InvariantCulture);
                    if (state.QueueSaleBundle(discovery.SourceKey, invoiceId, eventId, json))
                    {
                        queued++;
                        Console.WriteLine("Queued invoice " + invoiceId + " as " + eventId);
                    }
                    else
                    {
                        Console.WriteLine("Invoice " + invoiceId + " already exists in the local outbox; watermark reconciled.");
                    }
                }

                Console.WriteLine();
                Console.WriteLine("Detected invoices : " + invoiceIds.Count);
                Console.WriteLine("Newly queued      : " + queued);
                Console.WriteLine("Pending outbox    : " + state.CountPendingSaleEvents(discovery.SourceKey));
                Console.WriteLine("New watermark     : " + state.GetSaleWatermark(discovery.SourceKey));
                Console.WriteLine("Local state       : " + BridgeStateStore.DatabasePath);
                Console.WriteLine();
                Console.WriteLine("No writes were performed against Edaa.");
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

        private static LocalSaleBundle BuildBundle(EdaaDiscoveryResult discovery, SqlConnection connection, long invoiceId)
        {
            var header = ReadHeader(connection, invoiceId);
            if (header == null) return null;
            var lines = ReadLines(connection, invoiceId);
            return new LocalSaleBundle
            {
                bundle_version = "edaa-sale-bundle-v1",
                adapter_code = "edaa_v5",
                source_key = discovery.SourceKey,
                source_database = discovery.DatabaseName,
                schema_fingerprint = discovery.SchemaFingerprint,
                captured_at_utc = DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture),
                sale = header,
                lines = lines,
                calculated_lines_total = lines.Where(x => x.total_amount.HasValue).Sum(x => x.total_amount.Value)
            };
        }

        private static LocalSaleHeader ReadHeader(SqlConnection connection, long invoiceId)
        {
            const string sql = @"
select top 1
    ID, TheNumber, TheDate, ThePay, CustomerName, AccountID, CurrencyID,
    ExchangePrice, Descount, Notes, Deleted, IsLocked, IsMerit, UserID,
    BranchID, EntryID, ClassEntryID, EnterTime
from tblSellInvoice
where ID = @id";

            using (var command = new SqlCommand(sql, connection))
            {
                command.CommandTimeout = 15;
                command.Parameters.AddWithValue("@id", invoiceId);
                using (var reader = command.ExecuteReader())
                {
                    if (!reader.Read()) return null;
                    return new LocalSaleHeader
                    {
                        id = Convert.ToInt64(reader["ID"], CultureInfo.InvariantCulture),
                        number = StringValue(reader["TheNumber"]),
                        document_date = DateValue(reader["TheDate"]),
                        payment_type = StringValue(reader["ThePay"]),
                        customer_name = StringValue(reader["CustomerName"]),
                        account_id = LongValue(reader["AccountID"]),
                        currency_id = LongValue(reader["CurrencyID"]),
                        exchange_price = DecimalValue(reader["ExchangePrice"]),
                        discount = DecimalValue(reader["Descount"]),
                        notes = StringValue(reader["Notes"]),
                        deleted = BoolValue(reader["Deleted"]),
                        locked = BoolValue(reader["IsLocked"]),
                        merit = BoolValue(reader["IsMerit"]),
                        user_id = LongValue(reader["UserID"]),
                        branch_id = LongValue(reader["BranchID"]),
                        entry_id = LongValue(reader["EntryID"]),
                        class_entry_id = LongValue(reader["ClassEntryID"]),
                        entered_at = DateValue(reader["EnterTime"])
                    };
                }
            }
        }

        private static List<LocalSaleLine> ReadLines(SqlConnection connection, long invoiceId)
        {
            const string sql = @"
select
    d.ID, d.ParentID, d.ClassID, c.ClassName, d.Quantity, d.UnitID, u.UnitName,
    d.UnitPrice, d.SubDescount, d.TotalAmount, d.SubStoreAccountID, d.UserID,
    d.BranchID, d.SerialNumber, d.ClassNotes, d.EnterTime
from tblSellInvoiceDetailes d
left join tblClasses c on c.ID = d.ClassID
left join tblUnits u on u.ID = d.UnitID
where d.ParentID = @parent_id
order by d.ID";

            var result = new List<LocalSaleLine>();
            using (var command = new SqlCommand(sql, connection))
            {
                command.CommandTimeout = 15;
                command.Parameters.AddWithValue("@parent_id", invoiceId);
                using (var reader = command.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        result.Add(new LocalSaleLine
                        {
                            id = Convert.ToInt64(reader["ID"], CultureInfo.InvariantCulture),
                            parent_id = Convert.ToInt64(reader["ParentID"], CultureInfo.InvariantCulture),
                            class_id = LongValue(reader["ClassID"]),
                            class_name = StringValue(reader["ClassName"]),
                            quantity = DecimalValue(reader["Quantity"]),
                            unit_id = LongValue(reader["UnitID"]),
                            unit_name = StringValue(reader["UnitName"]),
                            unit_price = DecimalValue(reader["UnitPrice"]),
                            discount = DecimalValue(reader["SubDescount"]),
                            total_amount = DecimalValue(reader["TotalAmount"]),
                            store_account_id = LongValue(reader["SubStoreAccountID"]),
                            user_id = LongValue(reader["UserID"]),
                            branch_id = LongValue(reader["BranchID"]),
                            serial_number = StringValue(reader["SerialNumber"]),
                            notes = StringValue(reader["ClassNotes"]),
                            entered_at = DateValue(reader["EnterTime"])
                        });
                    }
                }
            }
            return result;
        }

        private static string StringValue(object value)
        {
            if (value == null || value == DBNull.Value) return null;
            return Convert.ToString(value, CultureInfo.InvariantCulture)?.Trim();
        }

        private static long? LongValue(object value)
        {
            if (value == null || value == DBNull.Value) return null;
            return Convert.ToInt64(value, CultureInfo.InvariantCulture);
        }

        private static decimal? DecimalValue(object value)
        {
            if (value == null || value == DBNull.Value) return null;
            return Convert.ToDecimal(value, CultureInfo.InvariantCulture);
        }

        private static bool BoolValue(object value)
        {
            if (value == null || value == DBNull.Value) return false;
            return Convert.ToBoolean(value, CultureInfo.InvariantCulture);
        }

        private static string DateValue(object value)
        {
            if (value == null || value == DBNull.Value) return null;
            return Convert.ToDateTime(value, CultureInfo.InvariantCulture)
                .ToString("yyyy-MM-ddTHH:mm:ss.fff", CultureInfo.InvariantCulture);
        }
    }
}
