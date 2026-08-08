# Production Edge Function Guardrails

- GitHub `main` is the source of truth.
- Customer-path functions must be explicitly classified as Core or Supporting Production.
- One-shot, session-specific, test, dry-run and retry-by-ID endpoints must not remain executable after their task is complete.
- Retired endpoints return HTTP 410 and require JWT while retained for safe failure/history.
- Benchmark, diagnostic, canary and shadow endpoints require an explicit purpose before production retention.
- Never retire a function solely because its slug contains `test`, `preview`, `benchmark`, `shadow`, or `candidate`.
