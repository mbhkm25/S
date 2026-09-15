using System;
using System.Diagnostics;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;

namespace Sanad.Bridge
{
    internal static class Program
    {
        private const string DefaultApiUrl = "https://api.sanadflow.com";

        private static async Task<int> Main(string[] args)
        {
            try
            {
                var existing = ProtectedIdentityStore.Load();
                if (existing != null && !string.IsNullOrWhiteSpace(existing.device_public_id))
                {
                    Console.WriteLine("SANAD Bridge is already linked to: " + (existing.business_name ?? existing.business_id));
                    Console.WriteLine("Device: " + existing.device_public_id);
                    return 0;
                }

                var sourceKey = args.Length > 0 && !string.IsNullOrWhiteSpace(args[0])
                    ? args[0].Trim()
                    : "edaa_v5:pending-discovery";
                var sourceLabel = args.Length > 1 && !string.IsNullOrWhiteSpace(args[1])
                    ? args[1].Trim()
                    : "إبداع سوفت — هذا الكمبيوتر";

                var apiUrl = Environment.GetEnvironmentVariable("SANAD_API_URL") ?? DefaultApiUrl;
                var publicApiKey = Environment.GetEnvironmentVariable("SANAD_PUBLIC_API_KEY");
                var deviceToken = BridgeCrypto.GenerateDeviceToken();
                var deviceHash = BridgeCrypto.Sha256Hex(deviceToken);
                var devicePrefix = deviceToken.Substring(0, Math.Min(8, deviceToken.Length));
                var bridgeVersion = Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "0.1.0";

                using (var client = new BridgeAuthorizationClient(apiUrl, publicApiKey))
                using (var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(11)))
                {
                    var init = await client.StartAsync(new AuthorizationInitRequest
                    {
                        device_credential_hash = deviceHash,
                        device_credential_prefix = devicePrefix,
                        device_label = Environment.MachineName,
                        bridge_version = bridgeVersion,
                        adapter_code = "edaa_v5",
                        adapter_version = "v1",
                        source_key = sourceKey,
                        source_label = sourceLabel,
                        source_version = null,
                        schema_fingerprint = null,
                    }, timeout.Token).ConfigureAwait(false);

                    if (!init.ok || string.IsNullOrWhiteSpace(init.authorization_url))
                        throw new InvalidOperationException(init.error ?? "authorization_init_failed");

                    Console.WriteLine("Opening SANAD to authorize this computer...");
                    OpenBrowser(init.authorization_url);

                    while (!timeout.IsCancellationRequested)
                    {
                        await Task.Delay(TimeSpan.FromSeconds(2), timeout.Token).ConfigureAwait(false);
                        var claim = await client.ClaimAsync(init.session_public_id, init.claim_secret, timeout.Token).ConfigureAwait(false);

                        if (claim.status == "pending") continue;
                        if (claim.status == "denied")
                        {
                            Console.WriteLine("Authorization was denied in SANAD.");
                            return 3;
                        }
                        if (claim.status == "expired" || claim.status == "revoked")
                        {
                            Console.WriteLine("Authorization request expired. Start the link flow again.");
                            return 4;
                        }
                        if (claim.status != "connected" || string.IsNullOrWhiteSpace(claim.device_public_id))
                            throw new InvalidOperationException(claim.error ?? "authorization_claim_failed");

                        ProtectedIdentityStore.Save(new StoredBridgeIdentity
                        {
                            device_public_id = claim.device_public_id,
                            device_token = deviceToken,
                            business_id = claim.business_id,
                            business_name = claim.business_name,
                            location_id = claim.location_id,
                            connection_id = claim.connection_id,
                            source_instance_id = claim.source_instance_id,
                            adapter_code = "edaa_v5",
                            source_key = sourceKey,
                            authorized_at_utc = DateTime.UtcNow,
                        });

                        Console.WriteLine("Linked successfully to SANAD business: " + (claim.business_name ?? claim.business_id));
                        Console.WriteLine("Protected identity stored at: " + ProtectedIdentityStore.IdentityPath);
                        return 0;
                    }
                }

                return 5;
            }
            catch (OperationCanceledException)
            {
                Console.Error.WriteLine("Authorization session ended before the link was completed.");
                return 5;
            }
            catch (BridgeAuthorizationException ex)
            {
                Console.Error.WriteLine("SANAD authorization error: " + ex.Message);
                return 2;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("SANAD Bridge failed to initialize: " + ex.Message);
                return 1;
            }
        }

        private static void OpenBrowser(string url)
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = url,
                UseShellExecute = true,
            });
        }
    }
}
