using System;
using System.Globalization;
using System.Reflection;
using System.Threading;
using System.Threading.Tasks;

namespace Sanad.Bridge
{
    internal static class EdaaLogicalSnapshotCommand
    {
        private const string DefaultApiUrl = "https://api.sanadflow.com";
        private const int DefaultIntervalMinutes = 360;
        private const int MinimumIntervalMinutes = 60;

        public static async Task<int> RunAsync(string[] args)
        {
            try
            {
                var force = HasArg(args, "--force-logical-snapshot");
                var intervalMinutes = ResolveIntervalMinutes(args);

                Console.WriteLine("SANAD Bridge logical ERP snapshot");
                Console.WriteLine("Mode: READ-ONLY structured cloud replica; no writes to Edaa");
                Console.WriteLine("Interval: " + intervalMinutes + " minute(s)");
                Console.WriteLine();

                var core = EdaaDiscoveryService.Discover();
                var identity = ProtectedIdentityStore.Load();
                if (identity == null || string.IsNullOrWhiteSpace(identity.device_public_id))
                {
                    Console.Error.WriteLine("Bridge device is not authorized yet.");
                    return 2;
                }

                if (!string.Equals(identity.source_key, core.SourceKey, StringComparison.Ordinal))
                {
                    Console.Error.WriteLine("Active Edaa source differs from the authorized source.");
                    return 6;
                }

                if (!string.IsNullOrWhiteSpace(identity.schema_fingerprint)
                    && !string.Equals(identity.schema_fingerprint, core.SchemaFingerprint, StringComparison.OrdinalIgnoreCase))
                {
                    Console.Error.WriteLine("Core Edaa schema drift detected. Logical snapshot is blocked safely.");
                    return 6;
                }

                using (var state = new BridgeStateStore())
                {
                    var run = state.GetLatestLogicalSnapshot(core.SourceKey);
                    if (run != null && string.Equals(run.Status, "completed", StringComparison.OrdinalIgnoreCase) && !force)
                    {
                        var completed = run.CompletedAtUtc ?? run.StartedAtUtc;
                        var nextDue = completed.AddMinutes(intervalMinutes);
                        if (DateTime.UtcNow < nextDue)
                        {
                            Console.WriteLine("Logical snapshot is current.");
                            Console.WriteLine("Last completed (UTC): " + completed.ToString("o", CultureInfo.InvariantCulture));
                            Console.WriteLine("Next due (UTC)      : " + nextDue.ToString("o", CultureInfo.InvariantCulture));
                            return 0;
                        }
                    }

                    if (run == null || string.Equals(run.Status, "completed", StringComparison.OrdinalIgnoreCase))
                    {
                        Console.WriteLine("Discovering complete Edaa table schema...");
                        var full = EdaaLogicalSnapshotDiscovery.Discover(core);
                        Console.WriteLine("Tables discovered        : " + full.Tables.Count);
                        Console.WriteLine("Full schema fingerprint  : " + full.FullSchemaFingerprint.Substring(0, 16) + "...");

                        Console.WriteLine("Preparing durable logical snapshot chunks...");
                        var package = EdaaLogicalSnapshotBuilder.Build(core, full);
                        state.CreateLogicalSnapshot(package);
                        run = state.GetLatestLogicalSnapshot(core.SourceKey);
                        if (run == null) throw new InvalidOperationException("logical_snapshot_state_not_created");
                        Console.WriteLine("Snapshot prepared locally: " + run.BaselinePublicId);
                    }

                    var apiUrl = Environment.GetEnvironmentVariable("SANAD_API_URL") ?? DefaultApiUrl;
                    var publicApiKey = Environment.GetEnvironmentVariable("SANAD_PUBLIC_API_KEY");

                    using (var cloud = new BridgeCloudClient(apiUrl, identity, publicApiKey))
                    using (var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(30)))
                    {
                        var started = await cloud.StartBaselineAsync(run, "logical_backup", timeout.Token).ConfigureAwait(false);
                        if (!started.ok) throw new BridgeCloudException(started.error ?? "logical_snapshot_start_failed", 0);

                        if (string.Equals(started.status, "completed", StringComparison.OrdinalIgnoreCase))
                        {
                            state.MarkLogicalSnapshotCompleted(run.BaselinePublicId);
                            Console.WriteLine("Cloud logical snapshot was already complete; local state reconciled.");
                            return 0;
                        }

                        state.MarkLogicalSnapshotUploading(run.BaselinePublicId);
                        var pending = state.GetPendingLogicalSnapshotEvents(run.BaselinePublicId);
                        Console.WriteLine("Pending snapshot chunks   : " + pending.Count);

                        foreach (var item in pending)
                        {
                            try
                            {
                                var ack = await cloud.SendEventAsync(item.BodyJson, timeout.Token).ConfigureAwait(false);
                                state.MarkLogicalSnapshotEventSent(item.EventId, ack);
                            }
                            catch (BridgeCloudException ex)
                            {
                                state.MarkLogicalSnapshotEventFailed(item.EventId, ex.Message, item.AttemptCount);
                                throw;
                            }
                            catch (Exception ex)
                            {
                                state.MarkLogicalSnapshotEventFailed(item.EventId, ex.GetType().Name, item.AttemptCount);
                                throw;
                            }
                        }

                        var unsent = state.CountUnsentLogicalSnapshotEvents(run.BaselinePublicId);
                        if (unsent > 0)
                        {
                            Console.WriteLine("Snapshot remains durable locally with " + unsent + " chunk(s) waiting for retry.");
                            return 7;
                        }

                        var completed = await cloud.CompleteBaselineAsync(run.BaselinePublicId, timeout.Token).ConfigureAwait(false);
                        if (!completed.ok || !string.Equals(completed.status, "completed", StringComparison.OrdinalIgnoreCase))
                            throw new BridgeCloudException(completed.error ?? "logical_snapshot_completion_failed", 0);

                        state.MarkLogicalSnapshotCompleted(run.BaselinePublicId);
                        Console.WriteLine("Logical ERP snapshot completed and acknowledged by SANAD.");
                        Console.WriteLine("No writes were performed against Edaa.");
                        return 0;
                    }
                }
            }
            catch (OperationCanceledException)
            {
                Console.Error.WriteLine("Logical snapshot timed out; durable local state was preserved for retry.");
                return 5;
            }
            catch (BridgeCloudException ex)
            {
                Console.Error.WriteLine("Logical snapshot cloud error: " + ex.Message);
                return 7;
            }
            catch (EdaaDiscoveryException ex)
            {
                Console.Error.WriteLine("Logical snapshot stopped safely: " + ex.Code);
                Console.Error.WriteLine(ex.Message);
                return 8;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("Logical snapshot failed safely: " + ex.Message);
                return 1;
            }
        }

        private static int ResolveIntervalMinutes(string[] args)
        {
            var value = Environment.GetEnvironmentVariable("SANAD_LOGICAL_SNAPSHOT_INTERVAL_MINUTES");
            for (var i = 0; args != null && i < args.Length - 1; i++)
            {
                if (string.Equals(args[i], "--logical-snapshot-interval-minutes", StringComparison.OrdinalIgnoreCase))
                    value = args[i + 1];
            }

            int parsed;
            if (!int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out parsed))
                parsed = DefaultIntervalMinutes;
            return Math.Max(MinimumIntervalMinutes, parsed);
        }

        private static bool HasArg(string[] args, string expected)
        {
            return args != null && Array.Exists(args, value => string.Equals(value, expected, StringComparison.OrdinalIgnoreCase));
        }
    }
}
