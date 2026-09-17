using System;
using System.Diagnostics;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;

namespace Sanad.Bridge
{
    internal static class BridgeDeviceAuthorizationCommand
    {
        public static async Task<int> RunAsync(string[] args)
        {
            try
            {
                Console.WriteLine("SANAD Bridge device authorization");
                Console.WriteLine("Mode: authorize this Edaa source only; no baseline or sale data will be uploaded");
                Console.WriteLine();

                var discovery = EdaaDiscoveryService.Discover();
                Console.WriteLine("Edaa database : " + discovery.DatabaseName);
                Console.WriteLine("Source key    : " + discovery.SourceKey);
                Console.WriteLine("Schema        : " + discovery.SchemaFingerprint.Substring(0, 16) + "...");
                Console.WriteLine();

                var existing = ProtectedIdentityStore.Load();
                if (existing != null &&
                    !string.IsNullOrWhiteSpace(existing.device_public_id) &&
                    !string.IsNullOrWhiteSpace(existing.device_token))
                {
                    if (!string.Equals(existing.source_key, discovery.SourceKey, StringComparison.Ordinal))
                    {
                        Console.Error.WriteLine("An existing SANAD device identity belongs to a different Edaa source.");
                        Console.Error.WriteLine("Authorization stopped safely; the existing identity was not replaced.");
                        return 23;
                    }

                    Console.WriteLine("This machine is already authorized.");
                    Console.WriteLine("Device ID : " + existing.device_public_id);
                    Console.WriteLine("Business  : " + (existing.business_name ?? existing.business_id ?? "unknown"));
                    Console.WriteLine("Identity  : " + ProtectedIdentityStore.IdentityPath);
                    return 0;
                }

                var apiUrl = Environment.GetEnvironmentVariable("SANAD_API_URL") ?? "https://api.sanadflow.com";
                var publicApiKey = Environment.GetEnvironmentVariable("SANAD_PUBLIC_API_KEY");
                var bridgeVersion = Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "0.2.0";
                var deviceToken = BridgeCrypto.GenerateDeviceToken();
                var deviceHash = BridgeCrypto.Sha256Hex(deviceToken);
                var devicePrefix = deviceToken.Substring(0, Math.Min(8, deviceToken.Length));

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
                        source_key = discovery.SourceKey,
                        source_label = discovery.SourceLabel,
                        source_version = discovery.SourceVersion,
                        schema_fingerprint = discovery.SchemaFingerprint
                    }, timeout.Token).ConfigureAwait(false);

                    if (!init.ok || string.IsNullOrWhiteSpace(init.authorization_url))
                        throw new InvalidOperationException(init.error ?? "authorization_init_failed");

                    Console.WriteLine("Opening SANAD authorization page...");
                    OpenBrowser(init.authorization_url);
                    Console.WriteLine("Complete the authorization in the browser. This console will wait for the claim.");

                    while (!timeout.IsCancellationRequested)
                    {
                        await Task.Delay(TimeSpan.FromSeconds(2), timeout.Token).ConfigureAwait(false);
                        var claim = await client.ClaimAsync(init.session_public_id, init.claim_secret, timeout.Token).ConfigureAwait(false);

                        if (claim.status == "pending") continue;
                        if (claim.status == "denied")
                            throw new BridgeAuthorizationException("authorization_denied", System.Net.HttpStatusCode.Forbidden);
                        if (claim.status == "expired" || claim.status == "revoked")
                            throw new BridgeAuthorizationException("authorization_expired", System.Net.HttpStatusCode.Gone);
                        if (claim.status != "connected" || string.IsNullOrWhiteSpace(claim.device_public_id))
                            throw new InvalidOperationException(claim.error ?? "authorization_claim_failed");

                        var identity = new StoredBridgeIdentity
                        {
                            device_public_id = claim.device_public_id,
                            device_token = deviceToken,
                            business_id = claim.business_id,
                            business_name = claim.business_name,
                            location_id = claim.location_id,
                            connection_id = claim.connection_id,
                            source_instance_id = claim.source_instance_id,
                            adapter_code = "edaa_v5",
                            source_key = discovery.SourceKey,
                            source_version = discovery.SourceVersion,
                            schema_fingerprint = discovery.SchemaFingerprint,
                            authorized_at_utc = DateTime.UtcNow
                        };

                        ProtectedIdentityStore.Save(identity);
                        Console.WriteLine();
                        Console.WriteLine("Authorization completed.");
                        Console.WriteLine("Device ID : " + identity.device_public_id);
                        Console.WriteLine("Business  : " + (identity.business_name ?? identity.business_id ?? "unknown"));
                        Console.WriteLine("Identity  : " + ProtectedIdentityStore.IdentityPath);
                        Console.WriteLine("No baseline or sale event was uploaded by this command.");
                        return 0;
                    }
                }

                throw new OperationCanceledException("Authorization session ended before completion.");
            }
            catch (OperationCanceledException)
            {
                Console.Error.WriteLine("Authorization timed out. No device identity was saved.");
                return 5;
            }
            catch (BridgeAuthorizationException ex)
            {
                Console.Error.WriteLine("SANAD authorization error: " + ex.Message);
                return 2;
            }
            catch (BridgeCloudException ex)
            {
                Console.Error.WriteLine("SANAD authorization service error: " + ex.Message + " (HTTP " + ex.StatusCode + ")");
                return 7;
            }
            catch (EdaaDiscoveryException ex)
            {
                Console.Error.WriteLine("Edaa discovery stopped safely: " + ex.Code);
                Console.Error.WriteLine(ex.Message);
                return 8;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("Device authorization stopped safely: " + ex.Message);
                return 1;
            }
        }

        private static void OpenBrowser(string url)
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = url,
                UseShellExecute = true
            });
        }
    }
}
