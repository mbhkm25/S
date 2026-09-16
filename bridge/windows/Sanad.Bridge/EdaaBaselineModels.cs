using System;
using System.Collections.Generic;

namespace Sanad.Bridge
{
    internal sealed class BaselineOutboxSeed
    {
        public string EventId { get; set; }
        public string BodyJson { get; set; }
    }

    internal sealed class EdaaBaselinePackage
    {
        public string BaselinePublicId { get; set; }
        public string SourceKey { get; set; }
        public string SchemaFingerprint { get; set; }
        public string ManifestJson { get; set; }
        public string ExpectedCountsJson { get; set; }
        public List<BaselineOutboxSeed> Events { get; set; } = new List<BaselineOutboxSeed>();
    }

    internal sealed class LocalBaselineRun
    {
        public string BaselinePublicId { get; set; }
        public string SourceKey { get; set; }
        public string SchemaFingerprint { get; set; }
        public string Status { get; set; }
        public string ManifestJson { get; set; }
        public string ExpectedCountsJson { get; set; }
        public DateTime StartedAtUtc { get; set; }
        public DateTime? CompletedAtUtc { get; set; }
    }

    internal sealed class LocalOutboxItem
    {
        public string EventId { get; set; }
        public string BodyJson { get; set; }
        public int AttemptCount { get; set; }
    }

    internal sealed class BaselineLifecycleResponse
    {
        public bool ok { get; set; }
        public string status { get; set; }
        public string error { get; set; }
        public string baseline_public_id { get; set; }
        public object received_counts { get; set; }
        public DateTime? completed_at { get; set; }
        public int contract_version { get; set; }
    }
}
