using System;
using System.Globalization;

namespace Sanad.Bridge
{
    internal static class SaleOverlapBootstrapRepairCommand
    {
        public static int Run(string[] args)
        {
            try
            {
                long throughInvoiceId = 0;
                for (var i = 0; i < (args?.Length ?? 0); i++)
                {
                    if (!string.Equals(args[i], "--through-invoice", StringComparison.OrdinalIgnoreCase)) continue;
                    if (i + 1 >= args.Length || !long.TryParse(args[i + 1], NumberStyles.Integer, CultureInfo.InvariantCulture, out throughInvoiceId) || throughInvoiceId <= 0)
                    {
                        Console.Error.WriteLine("--through-invoice requires a positive invoice ID.");
                        return 2;
                    }
                }

                if (throughInvoiceId <= 0)
                {
                    Console.Error.WriteLine("Refusing repair without an explicit --through-invoice boundary.");
                    return 2;
                }

                var discovery = EdaaDiscoveryService.Discover();
                using (var sales = new SaleStateStore())
                {
                    var suppressed = sales.SuppressHistoricalPendingThrough(discovery.SourceKey, throughInvoiceId);

                    Console.WriteLine("SANAD Bridge historical-overlap repair");
                    Console.WriteLine("Source key       : " + discovery.SourceKey);
                    Console.WriteLine("Through invoice  : " + throughInvoiceId);
                    Console.WriteLine("Suppressed rows  : " + suppressed);
                    Console.WriteLine("Pending now      : " + sales.CountPending(discovery.SourceKey));
                    Console.WriteLine();
                    Console.WriteLine("Only pending/failed outbox rows at or below the explicit boundary were suppressed.");
                    Console.WriteLine("Sent ACK history was preserved. No Edaa or cloud writes were performed.");
                    return 0;
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("Historical-overlap repair stopped safely: " + ex.Message);
                return 1;
            }
        }
    }
}
