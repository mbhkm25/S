using System;
using System.Globalization;

namespace Sanad.Bridge
{
    internal static class SaleOutboxLifecycleProbe
    {
        public static int Run(string[] args)
        {
            var invoiceId = ParseInvoiceId(args);
            var mode = ParseMode(args);

            if (!invoiceId.HasValue)
            {
                Console.Error.WriteLine("--invoice-id is required.");
                return 22;
            }

            if (string.IsNullOrWhiteSpace(mode))
            {
                Console.Error.WriteLine("Use --simulate-failure or --simulate-ack.");
                return 22;
            }

            Console.WriteLine("SANAD Bridge sale outbox lifecycle probe");
            Console.WriteLine("Local simulation only. No cloud request will be made.");
            Console.WriteLine();

            using (var state = new SaleStateStore())
            {
                var item = state.GetByInvoiceId(invoiceId.Value);
                if (item == null)
                {
                    Console.Error.WriteLine("No sale outbox event found for invoice " + invoiceId.Value + ".");
                    return 21;
                }

                PrintState("BEFORE", item);

                if (mode == "failure")
                {
                    if (!state.IsDue(item, DateTime.UtcNow))
                    {
                        Console.WriteLine();
                        Console.WriteLine("Event is not due for another attempt yet.");
                        Console.WriteLine("Next attempt UTC: " + FormatDate(item.NextAttemptAtUtc));
                        return 23;
                    }

                    item = state.MarkFailed(item.EventId, "simulated_network_failure");
                    Console.WriteLine();
                    Console.WriteLine("Simulated send failure recorded.");
                    PrintState("AFTER FAILURE", item);
                    return 0;
                }

                if (string.Equals(item.Status, "sent", StringComparison.OrdinalIgnoreCase))
                {
                    Console.WriteLine();
                    Console.WriteLine("Event is already acknowledged as sent. No state change was needed.");
                    PrintState("UNCHANGED", item);
                    return 0;
                }

                if (!state.IsDue(item, DateTime.UtcNow))
                {
                    Console.WriteLine();
                    Console.WriteLine("Retry backoff is still active; simulated ACK is intentionally blocked until due.");
                    Console.WriteLine("Next attempt UTC: " + FormatDate(item.NextAttemptAtUtc));
                    return 23;
                }

                var ackJson = "{\"ok\":true,\"mode\":\"local-simulation\",\"invoice_id\":" +
                              invoiceId.Value.ToString(CultureInfo.InvariantCulture) +
                              ",\"acknowledged_at_utc\":\"" +
                              DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture) + "\"}";

                item = state.MarkSent(item.EventId, ackJson);
                Console.WriteLine();
                Console.WriteLine("Simulated ACK recorded.");
                PrintState("AFTER ACK", item);
                return 0;
            }
        }

        private static void PrintState(string label, LocalSaleOutboxItem item)
        {
            Console.WriteLine();
            Console.WriteLine("=== " + label + " ===");
            Console.WriteLine("Event ID       : " + item.EventId);
            Console.WriteLine("Invoice ID     : " + item.InvoiceId);
            Console.WriteLine("Status         : " + item.Status);
            Console.WriteLine("Attempt count  : " + item.AttemptCount);
            Console.WriteLine("Next attempt   : " + FormatDate(item.NextAttemptAtUtc));
            Console.WriteLine("Last error     : " + (item.LastError ?? "NULL"));
            Console.WriteLine("Sent UTC       : " + FormatDate(item.SentAtUtc));
            Console.WriteLine("ACK present    : " + (!string.IsNullOrWhiteSpace(item.AckJson) ? "yes" : "no"));
            if (!string.IsNullOrWhiteSpace(item.AckJson))
                Console.WriteLine("ACK JSON       : " + item.AckJson);
        }

        private static string FormatDate(DateTime? value)
        {
            return value.HasValue ? value.Value.ToString("o", CultureInfo.InvariantCulture) : "NULL";
        }

        private static long? ParseInvoiceId(string[] args)
        {
            if (args == null) return null;
            for (var i = 0; i < args.Length; i++)
            {
                if (!string.Equals(args[i], "--invoice-id", StringComparison.OrdinalIgnoreCase)) continue;
                if (i + 1 >= args.Length) return null;
                long value;
                return long.TryParse(args[i + 1], NumberStyles.Integer, CultureInfo.InvariantCulture, out value)
                    ? (long?)value
                    : null;
            }
            return null;
        }

        private static string ParseMode(string[] args)
        {
            if (args == null) return null;
            if (Array.Exists(args, x => string.Equals(x, "--simulate-failure", StringComparison.OrdinalIgnoreCase)))
                return "failure";
            if (Array.Exists(args, x => string.Equals(x, "--simulate-ack", StringComparison.OrdinalIgnoreCase)))
                return "ack";
            return null;
        }
    }
}
