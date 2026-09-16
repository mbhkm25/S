using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace Sanad.Bridge
{
    internal sealed class BridgeCloudClient : IDisposable
    {
        private readonly HttpClient _http;
        private readonly StoredBridgeIdentity _identity;
        private readonly JavaScriptSerializer _json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue, RecursionLimit = 200 };

        public BridgeCloudClient(string apiBaseUrl, StoredBridgeIdentity identity, string publicApiKey = null)
        {
            if (string.IsNullOrWhiteSpace(apiBaseUrl)) throw new ArgumentException("API base URL is required.", nameof(apiBaseUrl));
            _identity = identity ?? throw new ArgumentNullException(nameof(identity));
            if (string.IsNullOrWhiteSpace(identity.device_public_id) || string.IsNullOrWhiteSpace(identity.device_token))
                throw new InvalidOperationException("Bridge device identity is incomplete.");

            _http = new HttpClient { BaseAddress = new Uri(apiBaseUrl.TrimEnd('/') + "/"), Timeout = TimeSpan.FromSeconds(45) };
            _http.DefaultRequestHeaders.UserAgent.ParseAdd("SANAD-Bridge/0.2");
            if (!string.IsNullOrWhiteSpace(publicApiKey))
            {
                _http.DefaultRequestHeaders.TryAddWithoutValidation("apikey", publicApiKey.Trim());
                _http.DefaultRequestHeaders.TryAddWithoutValidation("Authorization", "Bearer " + publicApiKey.Trim());
            }
        }

        public Task<BaselineLifecycleResponse> StartBaselineAsync(LocalBaselineRun run, CancellationToken cancellationToken)
        {
            if (run == null) throw new ArgumentNullException(nameof(run));
            var request = new Dictionary<string, object>
            {
                ["action"] = "start",
                ["baseline_public_id"] = run.BaselinePublicId,
                ["baseline_kind"] = "initial",
                ["adapter_code"] = "edaa_v5",
                ["adapter_version"] = "v1",
                ["schema_fingerprint"] = run.SchemaFingerprint,
                ["manifest"] = _json.DeserializeObject(run.ManifestJson),
                ["expected_counts"] = _json.DeserializeObject(run.ExpectedCountsJson)
            };
            return PostAsync<BaselineLifecycleResponse>("functions/v1/sanad-erp-baseline-v1", _json.Serialize(request), cancellationToken, HttpStatusCode.Created, HttpStatusCode.OK);
        }

        public async Task<string> SendEventAsync(string eventJson, CancellationToken cancellationToken)
        {
            return await PostRawAsync("functions/v1/sanad-erp-ingest-v1", eventJson, cancellationToken, HttpStatusCode.OK).ConfigureAwait(false);
        }

        public Task<BaselineLifecycleResponse> CompleteBaselineAsync(string baselinePublicId, CancellationToken cancellationToken)
        {
            var request = new Dictionary<string, object>
            {
                ["action"] = "complete",
                ["baseline_public_id"] = baselinePublicId
            };
            return PostAsync<BaselineLifecycleResponse>("functions/v1/sanad-erp-baseline-v1", _json.Serialize(request), cancellationToken, HttpStatusCode.OK);
        }

        public Task<BaselineLifecycleResponse> FailBaselineAsync(string baselinePublicId, string errorCode, string errorDetail, bool incompatible, CancellationToken cancellationToken)
        {
            var request = new Dictionary<string, object>
            {
                ["action"] = "fail",
                ["baseline_public_id"] = baselinePublicId,
                ["error_code"] = errorCode,
                ["error_detail"] = errorDetail,
                ["incompatible"] = incompatible
            };
            return PostAsync<BaselineLifecycleResponse>("functions/v1/sanad-erp-baseline-v1", _json.Serialize(request), cancellationToken, HttpStatusCode.OK);
        }

        private async Task<T> PostAsync<T>(string path, string payload, CancellationToken cancellationToken, params HttpStatusCode[] acceptedStatuses)
        {
            var body = await PostRawAsync(path, payload, cancellationToken, acceptedStatuses).ConfigureAwait(false);
            try
            {
                return _json.Deserialize<T>(body);
            }
            catch (Exception ex)
            {
                throw new BridgeCloudException("invalid_server_response", 0, ex);
            }
        }

        private async Task<string> PostRawAsync(string path, string payload, CancellationToken cancellationToken, params HttpStatusCode[] acceptedStatuses)
        {
            using (var request = new HttpRequestMessage(HttpMethod.Post, path))
            {
                request.Headers.TryAddWithoutValidation("x-sanad-device-id", _identity.device_public_id);
                request.Headers.TryAddWithoutValidation("x-sanad-device-token", _identity.device_token);
                request.Content = new StringContent(payload ?? "{}", Encoding.UTF8, "application/json");

                using (var response = await _http.SendAsync(request, cancellationToken).ConfigureAwait(false))
                {
                    var responseBody = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                    if (Array.IndexOf(acceptedStatuses, response.StatusCode) >= 0) return responseBody;

                    var errorCode = "http_" + (int)response.StatusCode;
                    try
                    {
                        var parsed = _json.Deserialize<Dictionary<string, object>>(responseBody);
                        object error;
                        if (parsed != null && parsed.TryGetValue("error", out error) && error != null)
                            errorCode = Convert.ToString(error);
                    }
                    catch
                    {
                        // HTTP status remains the safe fallback.
                    }
                    throw new BridgeCloudException(errorCode, (int)response.StatusCode);
                }
            }
        }

        public void Dispose()
        {
            _http.Dispose();
        }
    }

    internal sealed class BridgeCloudException : Exception
    {
        public int StatusCode { get; private set; }

        public BridgeCloudException(string code, int statusCode, Exception inner = null)
            : base(code, inner)
        {
            StatusCode = statusCode;
        }
    }
}
