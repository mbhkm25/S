using System;

namespace Sanad.Bridge
{
    internal static class BridgeAgentHealthCommand
    {
        public static int Run(string[] args)
        {
            try
            {
                var identity = ProtectedIdentityStore.Load();
                var discovery = EdaaDiscoveryService.Discover();

                using (var state = new BridgeStateStore())
                {
                    var watermark = state.GetSaleWatermark(discovery.SourceKey);
                    var pending = state.CountPendingSaleEvents(discovery.SourceKey);

                    Console.WriteLine("SANAD Bridge local health");
                    Console.WriteLine("Mode: read-only local runtime snapshot");
                    Console.WriteLine();
                    Console.WriteLine("Edaa database : " + discovery.DatabaseName);
                    Console.WriteLine("Source key    : " + discovery.SourceKey);
                    Console.WriteLine("Device ID     : " + (identity?.device_public_id ?? "not-authorized"));
                    Console.WriteLine("Business      : " + (identity?.business_name ?? identity?.business_id ?? "unknown"));
                    Console.WriteLine("Watermark     : " + (watermark.HasValue ? watermark.Value.ToString() : "NULL"));
                    Console.WriteLine("Pending outbox: " + pending);
                    Console.WriteLine("Identity file : " + (identity == null ? "missing" : "present"));
                    Console.WriteLine("State DB      : " + BridgeStateStore.DatabasePath);

                    if (identity == null || string.IsNullOrWhiteSpace(identity.device_public_id))
                        return 22;

                    if (!string.Equals(identity.source_key, discovery.SourceKey, StringComparison.Ordinal))
                        return 23;

                    return pending == 0 ? 0 : 29;
                }
            }
            catch (EdaaDiscoveryException ex)
            {
                Console.Error.WriteLine("Health check stopped safely: " + ex.Code);
                return 8;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("Health check stopped safely: " + ex.Message);
                return 1;
            }
        }
    }
}
