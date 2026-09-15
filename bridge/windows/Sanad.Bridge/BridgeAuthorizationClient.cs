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
    internal sealed class BridgeAuthorizationClient : IDisposable
    {
        private readonly HttpClient _http;
        private readonly JavaScriptSerializer _json = new JavaScriptSerializer();

        public BridgeAuthorizationClient(string apiBaseUrl, string publicApiKey = null)
        {
            if (string.IsNullOrWhiteSpace(apiBaseUrl)) throw new ArgumentException("API base URL is required.", nameof(apiBaseUrl));
            _http = new HttpClient { BaseAddress = new Uri(apiBaseUrl.TrimEnd('/') + "/") };
            _http.Timeout = TimeSpan.FromSeconds(30);
            if (!string.IsNullOrWhiteSpace(publicApiKey))
            {
                _http.DefaultRequestHeaders.TryAddWithoutValidation("apikey", publicApiKey.Trim());
            }
            _http.DefaultRequestHeaders.UserAgent.ParseAdd("SANAD-Bridge/0.1");
        }

        public Task<AuthorizationInitResponse> StartAsync(AuthorizationInitRequest request, CancellationToken cancellationToken)
        {
            return PostAsync<AuthorizationInitRequest, AuthorizationInitResponse>(
                "functions/v1/sanad-bridge-auth-init-v1",
                request,
                cancellationToken,
                HttpStatusCode.Created,
                HttpStatusCode.OK);
        }

        public Task<AuthorizationClaimResponse> ClaimAsync(string sessionPublicId, string claimSecret, CancellationToken cancellationToken)
        {
            return PostAsync<AuthorizationClaimRequest, AuthorizationClaimResponse>(
                "functions/v1/sanad-bridge-auth-claim-v1",
                new AuthorizationClaimRequest
                {
                    session_public_id = sessionPublicId,
                    claim_secret = claimSecret,
                },
                cancellationToken,
                HttpStatusCode.OK,
                HttpStatusCode.Accepted);
        }

        private async Task<TResponse> PostAsync<TRequest, TResponse>(
            string path,
            TRequest request,
            CancellationToken cancellationToken,
            params HttpStatusCode[] acceptedStatuses)
        {
            var payload = _json.Serialize(request);
            using (var content = new StringContent(payload, Encoding.UTF8, "application/json"))
            using (var response = await _http.PostAsync(path, content, cancellationToken).ConfigureAwait(false))
            {
                var responseBody = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                var accepted = Array.IndexOf(acceptedStatuses, response.StatusCode) >= 0;
                if (!accepted)
                {
                    var errorCode = "http_" + (int)response.StatusCode;
                    try
                    {
                        var parsed = _json.Deserialize<Dictionary<string, object>>(responseBody);
                        object error;
                        if (parsed != null && parsed.TryGetValue("error", out error) && error != null)
                        {
                            errorCode = Convert.ToString(error);
                        }
                    }
                    catch
                    {
                        // The status code remains the safe error surface.
                    }
                    throw new BridgeAuthorizationException(errorCode, response.StatusCode);
                }

                try
                {
                    return _json.Deserialize<TResponse>(responseBody);
                }
                catch (Exception ex)
                {
                    throw new BridgeAuthorizationException("invalid_server_response", response.StatusCode, ex);
                }
            }
        }

        public void Dispose()
        {
            _http.Dispose();
        }
    }

    internal sealed class BridgeAuthorizationException : Exception
    {
        public HttpStatusCode StatusCode { get; private set; }

        public BridgeAuthorizationException(string code, HttpStatusCode statusCode, Exception inner = null)
            : base(code, inner)
        {
            StatusCode = statusCode;
        }
    }
}
