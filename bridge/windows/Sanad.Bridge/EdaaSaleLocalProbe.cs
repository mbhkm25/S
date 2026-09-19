using System;
using System.Collections.Generic;
using System.Data.SqlClient;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Web.Script.Serialization;

namespace Sanad.Bridge
{
    internal sealed class LocalSaleBundle
    {
        public string bundle_version { get; set; }
        public string adapter_code { get; set; }
        public string source_key { get; set; }
        public string source_database { get; set; }
        public string schema_fingerprint { get; set; }
        public string captured_at_utc { get; set; }
        public LocalSaleHeader sale { get; set; }
        public List<LocalSaleLine> lines { get; set; } = new List<LocalSaleLine>();
        public decimal calculated_lines_total { get; set; }
    }

    internal sealed class LocalSaleHeader
    {
        public long id { get; set; }
        public string number { get; set; }
        public string document_date { get; set; }
        public string payment_type { get; set; }
        public string customer_name { get; set; }
        public long? account_id { get; set; }
        public long? currency_id { get; set; }
        public decimal? exchange_price { get; set; }
        public decimal? discount { get; set; }
        public string notes { get; set; }
        public bool deleted { get; set; }
        public bool locked { get; set; }
        public bool merit { get; set; }
        public long? user_id { get; set; }
        public long? branch_id { get; set; }
        public long? entry_id { get; set; }
        public long? class_entry_id { get; set; }
        public string entered_at { get; set; }
    }

    internal sealed class LocalSaleLine
    {
        public long id { get; set; }
        public long parent_id { get; set; }
        public long? class_id { get; set; }
        public string class_name { get; set; }
        public decimal? quantity { get; set; }
        public long? unit_id { get; set; }
        public string unit_name { get; set; }
        public decimal? unit_price { get; set; }
        public decimal? discount { get; set; }
        public decimal? total_amount { get; set; }
        public long? store_account_id { get; set; }
        public long? user_id { get; set; }
        public long? branch_id { get; set; }
        public string serial_number { get; set; }
        public string notes { get; set; }
        public string entered_at { get; set; }
    }

    internal static class EdaaSaleLocalProbe
    {
        public static int Run(string[] args)
        {
            var requestedInvoiceId = ParseInvoiceId(args);
            Console.WriteLine("SANAD Bridge local sale probe");
            Console.WriteLine("Mode: READ-ONLY");
            Console.WriteLine();

            var discovery = EdaaDiscoveryService.Discover();
            Console.WriteLine("Edaa database : " + discovery.DatabaseName);
            Console.WriteLine("Source key    : " + discovery.SourceKey);
            Console.WriteLine();

            using (var connection = new SqlConnection(discovery.CreateDatabaseConnectionString()))
            {
                connection.Open();
                var header = ReadHeader(connection, requestedInvoiceId);
                if (header == null)
                {
                    Console.Error.WriteLine(requestedInvoiceId.HasValue
                        ? "Invoice ID " + requestedInvoiceId.Value + " was not found."
                        : "No sale invoice was found.");
                    return 20;
                }

                var lines = ReadLines(connection, header.id);
                var bundle = new LocalSaleBundle
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

                var serializer = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
                var json = serializer.Serialize(bundle);
                var diagnosticsDir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
                    "SANAD",
                    "Bridge",
                    "diagnostics");
                Directory.CreateDirectory(diagnosticsDir);
                var outputPath = Path.Combine(
                    diagnosticsDir,
                    "sale-" + header.id + "-" + DateTime.UtcNow.ToString("yyyyMMdd-HHmmss", CultureInfo.InvariantCulture) + ".json");
                File.WriteAllText(outputPath, json, new System.Text.UTF8Encoding(false));

                Console.WriteLine("Invoice ID       : " + header.id);
                Console.WriteLine("Invoice number   : " + header.number);
                Console.WriteLine("Customer         : " + header.customer_name);
                Console.WriteLine("Payment type     : " + header.payment_type);
                Console.WriteLine("Currency ID      : " + (header.currency_id.HasValue ? header.currency_id.Value.ToString(CultureInfo.InvariantCulture) : "NULL"));
                Console.WriteLine("Lines            : " + lines.Count);
                Console.WriteLine("Lines total       : " + bundle.calculated_lines_total.ToString("0.##########", CultureInfo.InvariantCulture));
                Console.WriteLine();
                Console.WriteLine("JSON bundle:");
                Console.WriteLine(outputPath);
                Console.WriteLine();
                Console.WriteLine("No writes were performed against Edaa.");
                return 0;
            }
        }

        private static long? ParseInvoiceId(string[] args)
        {
            if (args == null) return null;
            for (var i = 0; i < args.Length; i++)
            {
                if (!string.Equals(args[i], "--invoice-id", StringComparison.OrdinalIgnoreCase)) continue;
                if (i + 1 >= args.Length) throw new ArgumentException("--invoice-id requires a numeric value.");
                long value;
                if (!long.TryParse(args[i + 1], NumberStyles.Integer, CultureInfo.InvariantCulture, out value))
                    throw new ArgumentException("Invalid --invoice-id value.");
                return value;
            }
            return null;
        }

        private static LocalSaleHeader ReadHeader(SqlConnection connection, long? invoiceId)
        {
            var sql = @"
select top 1
    ID, TheNumber, TheDate, ThePay, CustomerName, AccountID, CurrencyID,
    ExchangePrice, Descount, Notes, Deleted, IsLocked, IsMerit, UserID,
    BranchID, EntryID, ClassEntryID, EnterTime
from tblSellInvoice
";
            if (invoiceId.HasValue) sql += " where ID = @id ";
            else sql += " order by ID desc ";

            using (var command = new SqlCommand(sql, connection))
            {
                command.CommandTimeout = 15;
                if (invoiceId.HasValue) command.Parameters.AddWithValue("@id", invoiceId.Value);
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
