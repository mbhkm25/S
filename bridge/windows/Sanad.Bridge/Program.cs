using System;
using System.Diagnostics;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace Sanad.Bridge
{
    internal static class Program
    {
        private const string DefaultApiUrl = "https://api.sanadflow.com";

        private static async Task<int> Main(string[] args)
        {
            ConfigureConsoleEncoding();
            if (args != null && Array.Exists(args, value => string.Equals(value, "--local-probe", StringComparison.OrdinalIgnoreCase)))
            {
                return EdaaSaleLocalProbe.Run(args);
            }

            if (args != null && Array.Exists(args, value => string.Equals(value, "--logical-discovery", StringComparison.OrdinalIgnoreCase)))
            {
                return EdaaLogicalDiscoveryCommand.Run(args);
            }

            if (args != null && Array.Exists(args, value => string.Equals(value, "--semantic-schema", StringComparison.OrdinalIgnoreCase)))
            {
                return EdaaSemanticSchemaCommand.Run(args);
            }

            if (args != null && Array.Exists(args, value => string.Equals(value, "--relationship-audit", StringComparison.OrdinalIgnoreCase)))
            {
                return EdaaRelationshipAuditCommand.Run(args);
            }

            if (args != null && Array.Exists(args, value => string.Equals(value, "--local-scan", StringComparison.OrdinalIgnoreCase)))
            {
                return EdaaSaleChangeDetector.Run(args);
            }

            if (args != null && Array.Exists(args, value => string.Equals(value, "--outbox-inspect", StringComparison.OrdinalIgnoreCase)))
            {
                return SaleOutboxInspector.Run(args);
            }

            if (args != null && Array.Exists(args, value => string.Equals(value, "--outbox-lifecycle", StringComparison.OrdinalIgnoreCase)))
            {
                return SaleOutboxLifecycleProbe.Run(args);
            }

            if (args != null && Array.Exists(args, value => string.Equals(value, "--transaction-envelope", StringComparison.OrdinalIgnoreCase)))
            {
                return EdaaTransactionEnvelopeV1.Run(args);
            }

            if (args != null && Array.Exists(args, value => string.Equals(value, "--authorize-device", StringComparison.OrdinalIgnoreCase)))
            {
                return await BridgeDeviceAuthorizationCommand.RunAsync(args).ConfigureAwait(false);
            }

            if (args != null && Array.Exists(args, value => string.Equals(value, "--repair-overlap-bootstrap", StringComparison.OrdinalIgnoreCase)))
            {
                return SaleOverlapBootstrapRepairCommand.Run(args);
            }

            if (args != null && Array.Exists(args, value => string.Equals(value, "--agent-health", StringComparison.OrdinalIgnoreCase)))
            {
                return BridgeAgentHealthCommand.Run(args);
            }

            if (args != null && Array.Exists(args, value => string.Equals(value, "--logical-snapshot", StringComparison.OrdinalIgnoreCase)))
            {
                return await EdaaLogicalSnapshotCommand.RunAsync(args).ConfigureAwait(false);
            }

            if (args != null && Array.Exists(args, value => string.Equals(value, "--agent-cycle", StringComparison.OrdinalIgnoreCase)))
            {
                return await BridgeAgentCycleCommand.RunAsync(args).ConfigureAwait(false);
            }

            if (args != null && Array.Exists(args, value => string.Equals(value, "--heartbeat", StringComparison.OrdinalIgnoreCase)))
            {
                return await BridgeHeartbeatCommand.RunAsync(args).ConfigureAwait(false);
            }

            if (args != null && Array.Exists(args, value => string.Equals(value, "--cloud-send", StringComparison.OrdinalIgnoreCase)))
            {
                return await SaleCloudSender.RunAsync(args).ConfigureAwait(false);
            }

            try
            {
                Console.WriteLine("SANAD Bridge 0.2 — Edaa discovery and baseline sync");
                Console.WriteLine("Discovering the active Edaa installation read-only...");

                var discovery = EdaaDiscoveryService.Discover();
                Console.WriteLine("Edaa detected: " + discovery.DatabaseName);
                Console.WriteLine("Schema fingerprint: " + discovery.SchemaFingerprint.Substring(0, 16) + "...");

                var apiUrl = Environment.GetEnvironmentVariable("SANAD_API_URL") ?? DefaultApiUrl;
                var publicApiKey = Environment.GetEnvironmentVariable("SANAD_PUBLIC_API_KEY");
                var bridgeVersion = Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "0.2.0";

                var identity = ProtectedIdentityStore.Load();
                if (identity == null || string.IsNullOrWhiteSpace(identity.device_public_id))
                {
                    identity = await AuthorizeAsync(discovery, apiUrl, publicApiKey, bridgeVersion).ConfigureAwait(false);
                }
                else
                {
                    if (!string.Equals(identity.source_key, discovery.SourceKey, StringComparison.Ordinal))
                    {
                        Console.Error.WriteLine("The active Edaa database differs from the source authorized in SANAD.");
                        Console.Error.WriteLine("Sync is blocked until the new source is explicitly authorized.");
                        return 6;
                    }

                    if (string.IsNullOrWhiteSpace(identity.schema_fingerprint))
                    {
                        identity.schema_fingerprint = discovery.SchemaFingerprint;
                        identity.source_version = discovery.SourceVersion;
                        ProtectedIdentityStore.Save(identity);
                    }
                    else if (!string.Equals(identity.schema_fingerprint, discovery.SchemaFingerprint, StringComparison.OrdinalIgnoreCase))
                    {
                        Console.Error.WriteLine("Edaa schema drift detected. Sync is blocked safely.");
                        return 6;
                    }

                    Console.WriteLine("SANAD device identity: " + identity.device_public_id);
                    Console.WriteLine("Business: " + (identity.business_name ?? identity.business_id));
                }

                using (var state = new BridgeStateStore())
                {
                    var run = state.GetLatestBaseline(discovery.SourceKey, discovery.SchemaFingerprint);
                    if (run == null)
                    {
                        Console.WriteLine("Preparing the initial Edaa master-data baseline...");
                        var package = EdaaBaselineBuilder.Build(discovery);
                        state.CreateBaseline(package);
                        run = state.GetLatestBaseline(discovery.SourceKey, discovery.SchemaFingerprint);
                        if (run == null) throw new InvalidOperationException("baseline_state_not_created");
                        Console.WriteLine("Baseline prepared locally: " + run.BaselinePublicId);
                    }

                    if (string.Equals(run.Status, "completed", StringComparison.OrdinalIgnoreCase))
                    {
                        Console.WriteLine("Initial baseline is already complete for this Edaa source.");
                        Console.WriteLine("Local state: " + BridgeStateStore.DatabasePath);
                        return 0;
                    }

                    using (var cloud = new BridgeCloudClient(apiUrl, identity, publicApiKey))
                    using (var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(10)))
                    {
                        var started = await cloud.StartBaselineAsync(run, timeout.Token).ConfigureAwait(false);
                        if (!started.ok) throw new BridgeCloudException(started.error ?? "baseline_start_failed", 0);
                        if (string.Equals(started.status, "completed", StringComparison.OrdinalIgnoreCase))
                        {
                            state.MarkBaselineCompleted(run.BaselinePublicId);
                            Console.WriteLine("Cloud baseline was already complete; local state reconciled.");
                            return 0;
                        }

                        state.MarkBaselineUploading(run.BaselinePublicId);
                        var pending = state.GetPendingEvents(run.BaselinePublicId);
                        foreach (var item in pending)
                        {
                            try
                            {
                                Console.WriteLine("Uploading " + item.EventId + " ...");
                                var ack = await cloud.SendEventAsync(item.BodyJson, timeout.Token).ConfigureAwait(false);
                                state.MarkEventSent(item.EventId, ack);
                            }
                            catch (BridgeCloudException ex)
                            {
                                state.MarkEventFailed(item.EventId, ex.Message, item.AttemptCount);
                                throw;
                            }
                            catch (Exception ex)
                            {
                                state.MarkEventFailed(item.EventId, ex.GetType().Name, item.AttemptCount);
                                throw;
                            }
                        }

                        var unsent = state.CountUnsentEvents(run.BaselinePublicId);
                        if (unsent > 0)
                        {
                            Console.WriteLine("Baseline remains durable locally with " + unsent + " event(s) waiting for retry.");
                            return 7;
                        }

                        var completed = await cloud.CompleteBaselineAsync(run.BaselinePublicId, timeout.Token).ConfigureAwait(false);
                        if (!completed.ok || !string.Equals(completed.status, "completed", StringComparison.OrdinalIgnoreCase))
                            throw new BridgeCloudException(completed.error ?? "baseline_completion_failed", 0);

                        state.MarkBaselineCompleted(run.BaselinePublicId);
                        Console.WriteLine("Initial Edaa baseline completed and acknowledged by SANAD.");
                        Console.WriteLine("Local durable state: " + BridgeStateStore.DatabasePath);
                        return 0;
                    }
                }
            }
            catch (EdaaDiscoveryException ex)
            {
                Console.Error.WriteLine("Edaa discovery stopped safely: " + ex.Code);
                Console.Error.WriteLine(ex.Message);
                return 8;
            }
            catch (OperationCanceledException)
            {
                Console.Error.WriteLine("The operation timed out. Durable local state was preserved for retry.");
                return 5;
            }
            catch (BridgeAuthorizationException ex)
            {
                Console.Error.WriteLine("SANAD authorization error: " + ex.Message);
                return 2;
            }
            catch (BridgeCloudException ex)
            {
                Console.Error.WriteLine("SANAD cloud sync error: " + ex.Message);
                Console.Error.WriteLine("No Edaa writes were performed; queued data remains durable locally.");
                return 7;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("SANAD Bridge failed safely: " + ex.Message);
                return 1;
            }
        }

        private static async Task<StoredBridgeIdentity> AuthorizeAsync(
            EdaaDiscoveryResult discovery,
            string apiUrl,
            string publicApiKey,
            string bridgeVersion)
        {
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

                Console.WriteLine("Opening SANAD to authorize this Edaa source...");
                OpenBrowser(init.authorization_url);

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
                    Console.WriteLine("Linked successfully to SANAD business: " + (claim.business_name ?? claim.business_id));
                    Console.WriteLine("Protected device identity: " + ProtectedIdentityStore.IdentityPath);
                    return identity;
                }
            }

            throw new OperationCanceledException("Authorization session ended before completion.");
        }

        private static void ConfigureConsoleEncoding()
        {
            try
            {
                var utf8 = new UTF8Encoding(false);
                Console.OutputEncoding = utf8;
                Console.InputEncoding = utf8;
            }
            catch
            {
                // Encoding hardening is best-effort; Bridge execution must not fail because
                // a non-interactive Windows host does not expose a configurable console.
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
