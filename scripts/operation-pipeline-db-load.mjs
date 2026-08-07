import { randomUUID } from 'node:crypto';

const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const requestedConcurrency = Number(process.env.PIPELINE_TEST_CONCURRENCY || 100);
const concurrency = Math.max(2, Math.min(Number.isFinite(requestedConcurrency) ? requestedConcurrency : 100, 500));
const productionRef = 'hudbzlgclghlhazlduas';

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}
if (supabaseUrl.includes(productionRef)) {
  throw new Error('Refusing to mutate production. Use an isolated Supabase branch.');
}

const headers = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  'content-type': 'application/json',
};

async function rpc(name, body) {
  const started = performance.now();
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${name} HTTP ${response.status}: ${text.slice(0, 500)}`);
  }
  return {
    data: text ? JSON.parse(text) : null,
    durationMs: performance.now() - started,
  };
}

function percentile(values, ratio) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

const suffix = randomUUID().replaceAll('-', '');
const messageId = `wamid.pipeline.load.${suffix}`;
const pipelineRunId = randomUUID();
const claimPayload = {
  p_message_id: messageId,
  p_pipeline_run_id: pipelineRunId,
  p_sender_phone: '967700000005',
  p_media_id: `load-media-${suffix}`,
  p_declared_mime_type: 'image/png',
  p_signature_mode: 'verified',
  p_webhook_envelope: { fixture: 'operation-pipeline-db-load' },
  p_lease_seconds: 180,
};

const burstStarted = performance.now();
const claims = await Promise.all(
  Array.from({ length: concurrency }, () => rpc('claim_whatsapp_operation_intake', claimPayload)),
);
const burstDurationMs = performance.now() - burstStarted;
const winners = claims.filter((entry) => entry.data?.claimed === true);
const suppressed = claims.filter((entry) => entry.data?.duplicate === true);
if (winners.length !== 1 || suppressed.length !== concurrency - 1) {
  throw new Error(`Idempotency violation: winners=${winners.length}, suppressed=${suppressed.length}`);
}

const claimToken = winners[0].data.claim_token;
await rpc('record_whatsapp_operation_intake_storage', {
  p_message_id: messageId,
  p_claim_token: claimToken,
  p_storage_bucket: 'operation-files',
  p_storage_path: `pipeline-load/${messageId}.png`,
  p_storage_mime_type: 'image/png',
  p_file_original_name: 'load-fixture.png',
  p_file_size: 128,
  p_file_sha256: 'b'.repeat(64),
  p_media_metadata: { fixture: true },
});
const finalized = await rpc('finalize_whatsapp_operation_intake', {
  p_message_id: messageId,
  p_claim_token: claimToken,
  p_operation: { public_token: randomUUID(), submitted_by_name: 'Pipeline Load Test' },
});
await rpc('complete_whatsapp_operation_intake', {
  p_message_id: messageId,
  p_claim_token: claimToken,
  p_qr_delivery_status: 'skipped',
  p_qr_external_message_id: null,
});

const replay = await rpc('claim_whatsapp_operation_intake', {
  ...claimPayload,
  p_pipeline_run_id: randomUUID(),
});
if (replay.data?.claimed !== false || replay.data?.operation_id !== finalized.data?.operation_id) {
  throw new Error('Completed replay did not resolve to the canonical operation');
}

const failureMessageId = `wamid.pipeline.failure.${suffix}`;
const failureClaim = await rpc('claim_whatsapp_operation_intake', {
  ...claimPayload,
  p_message_id: failureMessageId,
  p_pipeline_run_id: randomUUID(),
  p_media_id: `failure-media-${suffix}`,
});
const failureState = await rpc('fail_whatsapp_operation_intake', {
  p_message_id: failureMessageId,
  p_claim_token: failureClaim.data.claim_token,
  p_retryable: true,
  p_error_code: 'load_test_transient',
  p_error_message: 'Injected transient failure from isolated branch harness',
});
if (failureState.data !== 'retry_scheduled') {
  throw new Error(`Retry contract failed: ${JSON.stringify(failureState.data)}`);
}

const durations = claims.map((entry) => entry.durationMs);
console.log(JSON.stringify({
  ok: true,
  target: new URL(supabaseUrl).host,
  concurrency,
  burst_duration_ms: Number(burstDurationMs.toFixed(2)),
  throughput_per_second: Number((concurrency / (burstDurationMs / 1000)).toFixed(2)),
  claim_latency_ms: {
    p50: Number(percentile(durations, 0.5).toFixed(2)),
    p95: Number(percentile(durations, 0.95).toFixed(2)),
    p99: Number(percentile(durations, 0.99).toFixed(2)),
  },
  duplicate_suppression: {
    winners: winners.length,
    suppressed: suppressed.length,
    rate: Number((suppressed.length / concurrency).toFixed(4)),
  },
  operation_id: finalized.data.operation_id,
  pipeline_run_id: pipelineRunId,
  retry_state: failureState.data,
}, null, 2));
