using System;
using System.Data.SQLite;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace Sanad.Bridge
{
    internal static class SaleOutboxInspector
    {
        private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("SANAD.Bridge.SaleOutbox.v1");

        public static int Run(string[] args)
        {
            var requestedInvoiceId = ParseInvoiceId(args);

            Console.WriteLine("SANAD Bridge sale outbox inspector");
            Console.WriteLine("Mode: READ-ONLY local SQLite + DPAPI decrypt");
            Console.WriteLine();
            Console.WriteLine("State database : " + BridgeStateStore.DatabasePath);

            using (var connection = new SQLiteConnection("Data Source=" + BridgeStateStore.DatabasePath + ";Version=3;Pooling=True;Read Only=True;"))
            {
                connection.Open();

                var sql = @"
select event_id, source_key, invoice_id, revision, body_protected, status,
       attempt_count, next_attempt_at_utc, last_error,
       created_at_utc, sent_at_utc, ack_protected
from sale_outbox";

                if (requestedInvoiceId.HasValue)
                    sql += " where invoice_id = @invoice_id ";

                sql += " order by invoice_id desc, created_at_utc desc";

                using (var command = new SQLiteCommand(sql, connection))
                {
                    if (requestedInvoiceId.HasValue)
                        command.Parameters.AddWithValue("@invoice_id", requestedInvoiceId.Value);

                    using (var reader = command.ExecuteReader())
                    {
                        var count = 0;
                        while (reader.Read())
                        {
                            count++;
                            Console.WriteLine();
                            Console.WriteLine("------------------------------------------------------------");
                            Console.WriteLine("Event ID       : " + reader.GetString(0));
                            Console.WriteLine("Source key     : " + reader.GetString(1));
                            Console.WriteLine("Invoice ID     : " + Convert.ToInt64(reader[2], CultureInfo.InvariantCulture));
                            Console.WriteLine("Revision       : " + reader.GetString(3));
                            Console.WriteLine("Status         : " + reader.GetString(5));
                            Console.WriteLine("Attempt count  : " + Convert.ToInt32(reader[6], CultureInfo.InvariantCulture));
                            Console.WriteLine("Next attempt   : " + DbText(reader, 7));
                            Console.WriteLine("Last error     : " + DbText(reader, 8));
                            Console.WriteLine("Created UTC    : " + DbText(reader, 9));
                            Console.WriteLine("Sent UTC       : " + DbText(reader, 10));
                            Console.WriteLine("ACK present    : " + (!reader.IsDBNull(11) ? "yes" : "no"));
                            if (!reader.IsDBNull(11))
                            {
                                Console.WriteLine("ACK JSON       : " + Unprotect((byte[])reader[11]));
                            }
                            Console.WriteLine();
                            Console.WriteLine("Envelope JSON:");
                            Console.WriteLine(Unprotect((byte[])reader[4]));
                        }

                        Console.WriteLine();
                        Console.WriteLine("------------------------------------------------------------");
                        Console.WriteLine("Events shown    : " + count);

                        if (count == 0)
                        {
                            Console.WriteLine(requestedInvoiceId.HasValue
                                ? "No outbox event found for invoice " + requestedInvoiceId.Value + "."
                                : "The sale outbox is empty.");
                            return 21;
                        }
                    }
                }
            }

            Console.WriteLine("No local state was modified.");
            return 0;
        }

        private static long? ParseInvoiceId(string[] args)
        {
            if (args == null) return null;

            for (var i = 0; i < args.Length; i++)
            {
                if (!string.Equals(args[i], "--invoice-id", StringComparison.OrdinalIgnoreCase))
                    continue;

                if (i + 1 >= args.Length)
                    throw new ArgumentException("--invoice-id requires a numeric value.");

                long value;
                if (!long.TryParse(args[i + 1], NumberStyles.Integer, CultureInfo.InvariantCulture, out value))
                    throw new ArgumentException("Invalid --invoice-id value.");

                return value;
            }

            return null;
        }

        private static string DbText(SQLiteDataReader reader, int ordinal)
        {
            return reader.IsDBNull(ordinal) ? "NULL" : Convert.ToString(reader[ordinal], CultureInfo.InvariantCulture);
        }

        private static string Unprotect(byte[] protectedBytes)
        {
            var plain = ProtectedData.Unprotect(protectedBytes, Entropy, DataProtectionScope.LocalMachine);
            return Encoding.UTF8.GetString(plain);
        }
    }
}
