using System;
using System.Collections;
using System.Collections.Generic;
using System.Data.SqlClient;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Web.Script.Serialization;

namespace Sanad.Bridge
{
    internal static class EdaaTransactionEnvelopeV1
    {
        private static readonly JavaScriptSerializer Json = new JavaScriptSerializer
        {
            MaxJsonLength = int.MaxValue,
            RecursionLimit = 300
        };

        public static int Run(string[] args)
        {
            var invoiceId = ParseInvoiceId(args);
            if (!invoiceId.HasValue)
                throw new ArgumentException("--invoice-id is required for --transaction-envelope.");

            Console.WriteLine("SANAD Bridge Edaa transaction envelope v1");
            Console.WriteLine("Mode: READ-ONLY Edaa + local envelope generation");
            Console.WriteLine();

            var discovery = EdaaDiscoveryService.Discover();
            Console.WriteLine("Edaa database : " + discovery.DatabaseName);
            Console.WriteLine("Source key    : " + discovery.SourceKey);

            using (var connection = new SqlConnection(discovery.CreateDatabaseConnectionString()))
            {
                connection.Open();
                var built = Build(discovery, connection, invoiceId.Value);
                if (built == null)
                {
                    Console.Error.WriteLine("Invoice " + invoiceId.Value + " was not found.");
                    return 20;
                }

                var diagnosticsDir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
                    "SANAD", "Bridge", "diagnostics");
                Directory.CreateDirectory(diagnosticsDir);

                var outputPath = Path.Combine(
                    diagnosticsDir,
                    "envelope-sale-" + invoiceId.Value.ToString(CultureInfo.InvariantCulture) + "-" +
                    DateTime.UtcNow.ToString("yyyyMMdd-HHmmss", CultureInfo.InvariantCulture) + ".json");

                var envelopeJson = Json.Serialize(built.Envelope);
                File.WriteAllText(outputPath, envelopeJson, new UTF8Encoding(false));

                Console.WriteLine();
                Console.WriteLine("Invoice ID          : " + invoiceId.Value);
                Console.WriteLine("Revision            : " + built.Revision);
                Console.WriteLine("Event ID            : " + built.EventId);
                Console.WriteLine("Sale lines          : " + built.SaleLineCount);
                Console.WriteLine("Accounting lines    : " + built.AccountingLineCount);
                Console.WriteLine("Inventory lines     : " + built.InventoryLineCount);
                Console.WriteLine("Accounting balanced : " + built.AccountingBalanced.ToString().ToLowerInvariant());
                Console.WriteLine("Inventory balanced  : " + built.InventoryBalanced.ToString().ToLowerInvariant());
                Console.WriteLine("Accounting link     : " + built.AccountingLinked.ToString().ToLowerInvariant());
                Console.WriteLine("Inventory link      : " + built.InventoryLinked.ToString().ToLowerInvariant());
                Console.WriteLine();
                Console.WriteLine("Envelope JSON:");
                Console.WriteLine(outputPath);
                Console.WriteLine();
                Console.WriteLine("No writes were performed against Edaa or SANAD Cloud.");
                return 0;
            }
        }

        internal static BuiltEnvelope Build(EdaaDiscoveryResult discovery, SqlConnection connection, long invoiceId)
        {
            var sale = ReadSingle(connection, @"
select top 1
    ID, TheNumber, TheDate, ThePay, ChequeNumber, ChequeDate, ChequeBank,
    CustomerName, AccountID, CurrencyID, ExchangePrice, MeritDateType, MeritDate,
    ClassDebit, StoreAccountID, Descount, Notes, Prints, Deleted, UserID, EnterTime,
    EntryID, ClassEntryID, BranchID, CostCenterID, SalesServices, VisaNo, TypeOfVisa,
    IsLocked, IsMerit
from tblSellInvoice
where ID=@id", "@id", invoiceId);

            if (sale == null) return null;

            var saleLines = ReadMany(connection, @"
select
    ID, ParentID, ClassID, Quantity, UnitID, UnitPrice, SubDescount, TotalAmount,
    SubStoreAccountID, EnterTime, UserID, BranchID, SerialNumber, ClassNotes
from tblSellInvoiceDetailes
where ParentID=@id
order by ID", "@id", invoiceId);

            var accountingEntryId = AsNullableLong(Get(sale, "EntryID"));
            var inventoryEntryId = AsNullableLong(Get(sale, "ClassEntryID"));

            SortedDictionary<string, object> accountingEntry = null;
            var accountingLines = new List<SortedDictionary<string, object>>();
            if (accountingEntryId.HasValue)
            {
                accountingEntry = ReadSingle(connection, @"
select top 1
    ID, EntryNumber, DocNumber, DocType, DocID, TheDate, Notes, UserID,
    Debited, Prints, EnterTime, BranchID
from tblEntries
where ID=@id", "@id", accountingEntryId.Value);

                accountingLines = ReadMany(connection, @"
select
    ID, ParentID, Amount, CurrencyID, MCAmount, AccountID, Notes,
    CostCenterID, BranchID, UserID, EnterTime
from tblEntriesDetails
where ParentID=@id
order by ID", "@id", accountingEntryId.Value);
            }

            SortedDictionary<string, object> inventoryEntry = null;
            var inventoryLines = new List<SortedDictionary<string, object>>();
            if (inventoryEntryId.HasValue)
            {
                inventoryEntry = ReadSingle(connection, @"
select top 1
    ID, DocType, DocID, TheNumber, Notes, TheDate, UserID, ThePay, PersonName,
    Descount, CurrencyID, ExchangePrice, Debited, ClassDebit, BranchID, EnterTime, TheSignal
from tblClassEntries
where ID=@id", "@id", inventoryEntryId.Value);

                inventoryLines = ReadMany(connection, @"
select
    ID, ParentID, AccountID, ClassID, UnitID, UnitPrice, SubDescount, Quantity,
    Amount, MCAmount, Notes, SerialNumber, BranchID, UserID, EnterTime, SubAccountID
from tblClassEntriesDetailes
where ParentID=@id
order by ID", "@id", inventoryEntryId.Value);
            }

            var accountingSum = accountingLines.Sum(x => AsDecimal(Get(x, "Amount")));
            var accountingBalanced = Math.Abs(accountingSum) < 0.000001m;

            var inventoryQuantitySum = inventoryLines.Sum(x => AsDecimal(Get(x, "Quantity")));
            var inventoryBalanced = Math.Abs(inventoryQuantitySum) < 0.000001m && InventoryGroupsBalanced(inventoryLines);

            var accountingLinked = accountingEntry != null &&
                                   AsNullableLong(Get(accountingEntry, "DocID")) == invoiceId;
            var inventoryLinked = inventoryEntry != null &&
                                  AsNullableLong(Get(inventoryEntry, "DocID")) == invoiceId;

            var integrity = new SortedDictionary<string, object>(StringComparer.Ordinal)
            {
                ["sale_lines"] = saleLines.Count,
                ["accounting_lines"] = accountingLines.Count,
                ["inventory_lines"] = inventoryLines.Count,
                ["accounting_balanced"] = accountingBalanced,
                ["accounting_amount_sum"] = accountingSum,
                ["inventory_quantity_balanced"] = inventoryBalanced,
                ["inventory_quantity_sum"] = inventoryQuantitySum,
                ["accounting_entry_linked"] = accountingLinked,
                ["inventory_entry_linked"] = inventoryLinked
            };

            var stableState = new SortedDictionary<string, object>(StringComparer.Ordinal)
            {
                ["sale"] = sale,
                ["sale_lines"] = saleLines,
                ["accounting_entry"] = accountingEntry,
                ["accounting_lines"] = accountingLines,
                ["inventory_entry"] = inventoryEntry,
                ["inventory_lines"] = inventoryLines,
                ["integrity"] = integrity
            };

            var revision = BridgeCrypto.Sha256Hex(Json.Serialize(stableState));
            var eventId = "edaa-sale-v1:" + discovery.SourceKey + ":" +
                          invoiceId.ToString(CultureInfo.InvariantCulture) + ":" + revision.Substring(0, 20);
            var capturedAt = DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture);

            var bundle = new SortedDictionary<string, object>(StringComparer.Ordinal)
            {
                ["schema_version"] = "ibex-1",
                ["event_id"] = eventId,
                ["merchant_instance_id"] = discovery.SourceKey,
                ["source_system"] = "edaa_v5",
                ["event_type"] = "sale_transaction",
                ["source_sale_id"] = invoiceId.ToString(CultureInfo.InvariantCulture),
                ["source_sale_number"] = AsString(Get(sale, "TheNumber")),
                ["captured_at"] = capturedAt,
                ["integrity"] = integrity,
                ["sale"] = sale,
                ["sale_lines"] = saleLines,
                ["accounting_entry"] = accountingEntry,
                ["accounting_lines"] = accountingLines,
                ["inventory_entry"] = inventoryEntry,
                ["inventory_lines"] = inventoryLines
            };

            var businessDate = DateOnlyText(Get(sale, "TheDate"));
            var sourceEnterTime = PlausibleTimestamp(Get(sale, "EnterTime"));

            var envelope = new SortedDictionary<string, object>(StringComparer.Ordinal)
            {
                ["event_id"] = eventId,
                ["adapter_code"] = "edaa_v5",
                ["adapter_version"] = "v1",
                ["event_schema_version"] = 1,
                ["entity_type"] = "sale",
                ["source_record_id"] = invoiceId.ToString(CultureInfo.InvariantCulture),
                ["revision"] = revision,
                ["captured_at"] = capturedAt,
                ["business_date"] = businessDate,
                ["source_enter_time"] = sourceEnterTime,
                ["payload"] = bundle,
                ["integrity"] = integrity
            };

            return new BuiltEnvelope
            {
                EventId = eventId,
                Revision = revision,
                Envelope = envelope,
                SaleLineCount = saleLines.Count,
                AccountingLineCount = accountingLines.Count,
                InventoryLineCount = inventoryLines.Count,
                AccountingBalanced = accountingBalanced,
                InventoryBalanced = inventoryBalanced,
                AccountingLinked = accountingLinked,
                InventoryLinked = inventoryLinked
            };
        }

        private static SortedDictionary<string, object> ReadSingle(SqlConnection connection, string sql, string parameterName, long value)
        {
            using (var command = new SqlCommand(sql, connection))
            {
                command.CommandTimeout = 15;
                command.Parameters.AddWithValue(parameterName, value);
                using (var reader = command.ExecuteReader())
                {
                    return reader.Read() ? ReadRow(reader) : null;
                }
            }
        }

        private static List<SortedDictionary<string, object>> ReadMany(SqlConnection connection, string sql, string parameterName, long value)
        {
            var result = new List<SortedDictionary<string, object>>();
            using (var command = new SqlCommand(sql, connection))
            {
                command.CommandTimeout = 15;
                command.Parameters.AddWithValue(parameterName, value);
                using (var reader = command.ExecuteReader())
                {
                    while (reader.Read()) result.Add(ReadRow(reader));
                }
            }
            return result;
        }

        private static SortedDictionary<string, object> ReadRow(SqlDataReader reader)
        {
            var row = new SortedDictionary<string, object>(StringComparer.Ordinal);
            for (var i = 0; i < reader.FieldCount; i++)
            {
                var value = reader.IsDBNull(i) ? null : reader.GetValue(i);
                if (value is DateTime)
                    value = ((DateTime)value).ToString("yyyy-MM-ddTHH:mm:ss.fff", CultureInfo.InvariantCulture);
                row[reader.GetName(i)] = value;
            }
            return row;
        }

        private static bool InventoryGroupsBalanced(List<SortedDictionary<string, object>> lines)
        {
            var groups = new Dictionary<string, decimal>(StringComparer.Ordinal);
            foreach (var line in lines)
            {
                var key = AsString(Get(line, "ClassID")) + ":" + AsString(Get(line, "UnitID"));
                decimal current;
                groups.TryGetValue(key, out current);
                groups[key] = current + AsDecimal(Get(line, "Quantity"));
            }
            return groups.Values.All(x => Math.Abs(x) < 0.000001m);
        }

        private static object Get(IDictionary<string, object> row, string key)
        {
            if (row == null) return null;
            object value;
            return row.TryGetValue(key, out value) ? value : null;
        }

        private static decimal AsDecimal(object value)
        {
            if (value == null || value == DBNull.Value) return 0m;
            return Convert.ToDecimal(value, CultureInfo.InvariantCulture);
        }

        private static long? AsNullableLong(object value)
        {
            if (value == null || value == DBNull.Value) return null;
            return Convert.ToInt64(value, CultureInfo.InvariantCulture);
        }

        private static string AsString(object value)
        {
            if (value == null || value == DBNull.Value) return null;
            return Convert.ToString(value, CultureInfo.InvariantCulture)?.Trim();
        }

        private static string DateOnlyText(object value)
        {
            var text = AsString(value);
            if (string.IsNullOrWhiteSpace(text)) return null;
            DateTime parsed;
            return DateTime.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out parsed)
                ? parsed.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)
                : null;
        }

        private static string PlausibleTimestamp(object value)
        {
            var text = AsString(value);
            if (string.IsNullOrWhiteSpace(text)) return null;
            DateTime parsed;
            if (!DateTime.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out parsed)) return null;
            if (parsed.Year < 2000 || parsed.Year > DateTime.UtcNow.Year + 1) return null;
            return parsed.ToString("yyyy-MM-ddTHH:mm:ss.fff", CultureInfo.InvariantCulture);
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
    }

    internal sealed class BuiltEnvelope
    {
        public string EventId { get; set; }
        public string Revision { get; set; }
        public SortedDictionary<string, object> Envelope { get; set; }
        public int SaleLineCount { get; set; }
        public int AccountingLineCount { get; set; }
        public int InventoryLineCount { get; set; }
        public bool AccountingBalanced { get; set; }
        public bool InventoryBalanced { get; set; }
        public bool AccountingLinked { get; set; }
        public bool InventoryLinked { get; set; }
    }
}
