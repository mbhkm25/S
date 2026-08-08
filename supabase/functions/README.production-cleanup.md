# Production Edge Function Guardrails

- GitHub `main` is the source of truth.
- Customer-path functions must be classified as Core or Supporting Production.
- Completed one-shot, session-specific, test, dry-run, retry-by-ID, obsolete canary/shadow/eval and candidate endpoints must not remain executable.
- Retired endpoints return HTTP 410 and require JWT while retained for safe failure/history.
- Reusable benchmark/diagnostic and authenticated shadow tooling may remain only as explicitly engineering-only surfaces; they are not customer-path dependencies.
- Never retire an endpoint by name alone; dependency evidence controls the decision.
