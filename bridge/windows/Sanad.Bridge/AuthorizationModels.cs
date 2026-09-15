using System;

namespace Sanad.Bridge
{
    internal sealed class AuthorizationInitRequest
    {
        public string device_credential_hash { get; set; }
        public string device_credential_prefix { get; set; }
        public string device_label { get; set; }
        public string bridge_version { get; set; }
        public string adapter_code { get; set; }
        public string adapter_version { get; set; }
        public string source_key { get; set; }
        public string source_label { get; set; }
        public string source_version { get; set; }
        public string schema_fingerprint { get; set; }
    }

    internal sealed class AuthorizationInitResponse
    {
        public bool ok { get; set; }
        public string status { get; set; }
        public string error { get; set; }
        public string session_public_id { get; set; }
        public string claim_secret { get; set; }
        public string authorization_url { get; set; }
        public DateTime expires_at { get; set; }
        public int contract_version { get; set; }
    }

    internal sealed class AuthorizationClaimRequest
    {
        public string session_public_id { get; set; }
        public string claim_secret { get; set; }
    }

    internal sealed class AuthorizationClaimResponse
    {
        public bool ok { get; set; }
        public string status { get; set; }
        public string error { get; set; }
        public string device_public_id { get; set; }
        public string business_id { get; set; }
        public string business_name { get; set; }
        public string location_id { get; set; }
        public string connection_id { get; set; }
        public string source_instance_id { get; set; }
        public DateTime expires_at { get; set; }
        public int contract_version { get; set; }
    }

    internal sealed class StoredBridgeIdentity
    {
        public string device_public_id { get; set; }
        public string device_token { get; set; }
        public string business_id { get; set; }
        public string business_name { get; set; }
        public string location_id { get; set; }
        public string connection_id { get; set; }
        public string source_instance_id { get; set; }
        public string adapter_code { get; set; }
        public string source_key { get; set; }
        public DateTime authorized_at_utc { get; set; }
    }
}
