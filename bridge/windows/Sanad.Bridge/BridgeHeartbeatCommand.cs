using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace Sanad.Bridge
{
    internal static class BridgeHeartbeatCommand
    {
        // In-process signal to the mutex-protected agent cycle, never a
        // shell command or arbitrary server-supplied argument.
        internal static Guid? PendingForcedRefreshRequestId { get; private set; }
        private static readonly JavaScriptSerializer Json = new JavaScriptSerializer
        {
            MaxJsonLength = int.MaxValue,
            RecursionLimit = 100
        };

        public static async Task<int> RunAsync(string[] args)
        {
            PendingForcedRefreshRequestId = null;
            try
            {
                Console.WriteLine("SANAD Bridge heartbeat");
                Console.WriteLine("Mode: device-authenticated cloud liveness probe");
                Console.WriteLine();

                var identity = ProtectedIdentityStore.Load();
                if (identity == null || string.IsNullOrWhiteSpace(identity.device_public_id) || string.IsNullOrWhiteSpace(identity.device_token))
                {
                    Console.Error.WriteLine("No authorized SANAD Bridge device identity is available on this machine.");
                    return 22;
                }

                var discovery = EdaaDiscoveryService.Discover();
                if (!string.Equals(identity.source_key, discovery.SourceKey, StringComparison.Ordinal))
                {
                    Console.Error.WriteLine("The authorized SANAD source does not match the active Edaa source. Heartbeat blocked.");
                    return 23;
                }

                var apiUrl = Environment.GetEnvironmentVariable("SANAD_API_URL") ?? "https://api.sanadflow.com";
                var publicApiKey = Environment.GetEnvironmentVariable("SANAD_PUBLIC_API_KEY");

                using (var http = new HttpClient
                {
                    BaseAddress = new Uri(apiUrl.TrimEnd('/') + "/"),
                    Timeout = TimeSpan.FromSeconds(30)
                })
                using (var request = new HttpRequestMessage(HttpMethod.Post, "functions/v1/sanad-erp-heartbeat-v1"))
                using (var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(35)))
                {
                    http.DefaultRequestHeaders.UserAgent.ParseAdd("SANAD-Bridge/0.2");
                    if (!string.IsNullOrWhiteSpace(publicApiKey))
                    {
                        http.DefaultRequestHeaders.TryAddWithoutValidation("apikey", publicApiKey.Trim());
                        http.DefaultRequestHeaders.TryAddWithoutValidation("Authorization", "Bearer " + publicApiKey.Trim());
                    }

                    request.Headers.TryAddWithoutValidation("x-sanad-device-id", identity.device_public_id);
                    request.Headers.TryAddWithoutValidation("x-sanad-device-token", identity.device_token);
                    // Heartbeat-only diagnostics may advertise capability but must not
                    // steal/claim an owner command without the mutex-protected cycle.
                    var pollCommands = args != null && Array.Exists(args, item =>
                        string.Equals(item, "--agent-cycle", StringComparison.OrdinalIgnoreCase));
                    var heartbeatBody = "{\"remote_refresh_v1\":true,\"poll_remote_refresh_v1\":"
                        + (pollCommands ? "true" : "false") + "}";
                    request.Content = new StringContent(heartbeatBody, Encoding.UTF8, "application/json");

                    using (var response = await http.SendAsync(request, timeout.Token).ConfigureAwait(false))
                    {
                        var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                        Dictionary<string, object> parsed = null;
                        try { parsed = Json.Deserialize<Dictionary<string, object>>(body); } catch { }

                        if (!response.IsSuccessStatusCode)
                        {
                            object error;
                            var code = parsed != null && parsed.TryGetValue("error", out error) && error != null
                                ? Convert.ToString(error)
                                : "http_" + (int)response.StatusCode;
                            Console.Error.WriteLine("Heartbeat failed: " + code + " (HTTP " + (int)response.StatusCode + ")");
                            return response.StatusCode == System.Net.HttpStatusCode.Unauthorized ? 25 : 7;
                        }

                        object status;
                        object serverTime;
                        var heartbeatStatus = parsed != null && parsed.TryGetValue("status", out status) ? Convert.ToString(status) : "unknown";
                        var heartbeatTime = parsed != null && parsed.TryGetValue("server_time", out serverTime) ? Convert.ToString(serverTime) : null;

                        if (string.Equals(heartbeatStatus, "alive", StringComparison.OrdinalIgnoreCase))
                        {
                            object requested;
                            var requestedValue = parsed != null && parsed.TryGetValue("refresh_request_id", out requested)
                                ? Convert.ToString(requested)
                                : null;
                            Guid validatedRequest;
                            if (!string.IsNullOrWhiteSpace(requestedValue)
                                && Guid.TryParse(requestedValue, out validatedRequest)
                                && validatedRequest != Guid.Empty)
                            {
                                PendingForcedRefreshRequestId = validatedRequest;
                                Console.WriteLine("A signed-in owner requested an immediate Edaa cloud refresh.");
                            }
                        }

                        Console.WriteLine("Edaa database : " + discovery.DatabaseName);
                        Console.WriteLine("Source key    : " + discovery.SourceKey);
                        Console.WriteLine("Device ID     : " + identity.device_public_id);
                        Console.WriteLine("Business      : " + (identity.business_name ?? identity.business_id ?? "unknown"));
                        Console.WriteLine("Cloud status  : " + heartbeatStatus);
                        Console.WriteLine("Server time   : " + (heartbeatTime ?? "unknown"));
                        Console.WriteLine();
                        Console.WriteLine("Heartbeat acknowledged. No Edaa writes were performed.");
                        return string.Equals(heartbeatStatus, "alive", StringComparison.OrdinalIgnoreCase) ? 0 : 26;
                    }
                }
            }
            catch (OperationCanceledException)
            {
                Console.Error.WriteLine("Heartbeat timed out.");
                return 5;
            }
            catch (EdaaDiscoveryException ex)
            {
                Console.Error.WriteLine("Edaa discovery stopped safely: " + ex.Code);
                Console.Error.WriteLine(ex.Message);
                return 8;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("Heartbeat stopped safely: " + ex.Message);
                return 1;
            }
        }
    }
}
