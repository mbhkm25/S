# SANAD Agent Performance & Observability v1

## Purpose

Stage 7 makes SANAD Agent measurable in production without storing conversation content in telemetry.

The observability model separates:
- user-perceived latency in the browser;
- server turn latency;
- model latency and transient retries;
- tool latency;
- persistence latency;
- thread loading;
- voice transcription;
- attachment upload and analysis;
- token usage and implicit-cache utilization.

## Privacy boundary

`sanad_agent_performance_metrics` stores operational numbers and identifiers only.

It does **not** store:
- prompt text;
- assistant answer text;
- document text;
- extracted attachment text;
- filenames;
- customer names;
- account numbers;
- credentials or tokens.

Metrics are scoped to the authenticated user. Server ingestion is service-role only; browser ingestion is limited to an allowlist of client metric scopes.

## Metrics

### Agent client turn

The browser records:
- total end-to-end latency;
- first progress latency;
- first answer latency;
- transport;
- attachment count;
- success/failure.

Because Agent v1 currently emits the final answer as one SSE event rather than token-by-token text, `first_answer_ms` measures time to the first final answer event. `first_progress_ms` captures how quickly the UI receives useful run progress.

### Agent server turn

The runtime records:
- context load latency;
- attachment-context load latency;
- aggregate model HTTP latency;
- aggregate tool latency;
- persistence latency;
- tool call count and failure count;
- Gemini retry count;
- input/cached/output/total tokens;
- total request latency;
- model, thinking level and transport.

AI usage accounting remains in the existing `record_ai_usage` ledger. Stage 7 fixes multi-round Agent accounting by aggregating usage across all Gemini interactions in the turn instead of recording only the final model round.

### Thread loading

The workspace records the time required to load:
- thread messages;
- Agent context/memory;
- attachments.

### Voice

The transcription Edge Function records:
- total latency;
- Gemini model latency;
- retry count;
- audio byte count;
- token usage when supplied by the provider;
- success/failure.

No audio is copied into telemetry.

### Attachments

The browser records upload-to-analysis end-to-end latency and bytes.

The analysis Edge Function records:
- total analysis latency;
- model latency;
- retry count;
- file byte count;
- token usage;
- success/failure.

No filename, OCR text, extracted text or model analysis payload is copied into telemetry.

## Retry policy

Gemini Interactions use bounded retry for transient failures only:
- maximum 3 attempts;
- retry HTTP 429 and 5xx responses;
- retry transient network failures;
- backoff: 250 ms, then 700 ms;
- do not retry ordinary non-429 4xx requests.

The retry count is emitted only as operational telemetry.

## Cache measurement

SANAD continues to rely on provider implicit caching rather than introducing a second cache of financial facts.

The performance summary calculates:

`cached_tokens / input_tokens`

This makes cache effectiveness observable without caching balances, invoices or other volatile domain facts in SANAD Agent.

## Existing tool execution telemetry

Individual tool executions continue to use:
- `start_sanad_assistant_tool_execution`
- `finish_sanad_assistant_tool_execution`

Those records provide tool name, status and individual latency.

Stage 7 adds aggregate tool latency and failed-tool count at the Agent-turn level rather than duplicating the existing per-tool execution log.

## User-visible diagnostics

Agent settings include a compact “أداء سند · آخر 7 أيام” panel showing available P50/P95 latency and failure-rate summaries for:
- Agent response;
- thread loading;
- voice transcription;
- attachment analysis.

The panel explicitly states that the metrics do not store message content.

## SLO baselines

Stage 7 creates measurement, not fabricated performance claims.

Initial production SLO targets should be set only after enough real production samples exist. Until then:
- P50/P95 are observational;
- failure rate is observational;
- no pass/fail target is inferred from synthetic data.

## Failure isolation

Telemetry is best-effort.

Failure to record a metric must never:
- fail a user turn;
- block voice transcription;
- block attachment analysis;
- block a thread load;
- alter an approved financial action.

## Source-of-truth boundary

Observability does not change SANAD's financial truth rules:
- ERP/Edaa remains read-only;
- currencies remain separate;
- current financial facts are read from authoritative tools;
- telemetry is never used as a source for balances or transaction state.
