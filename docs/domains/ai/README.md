# SANAD AI Domain

Status: staged Agent Runtime development. Read tools are authoritative; Action Integration v1 adds review-only drafts plus explicit UI approval for a bounded set of SANAD-owned domain commands. ERP/Edaa remains read-only.

## Product boundary

SANAD AI consumes authorized context from other SANAD domains. The model may prepare review-only action drafts. It cannot approve, post, settle, reverse or directly mutate financial/commercial records. Explicit authenticated UI approval may invoke a bounded deterministic SANAD domain command.

## Frontend entrypoint

- `/sanad-ai`

## Primary contract

- `get_ai_financial_context_v2`

The v2 gateway records each context request in `ai_financial_context_access_log` and delegates context assembly to the internal v1 contract.

## Security rules

- authentication is mandatory;
- business context requires explicit business-financial access;
- every v2 request creates an audit record;
- the client receives read-only context;
- direct client INSERT into the AI audit log remains revoked;
- model-visible financial execution tools remain prohibited;
- review-only draft preparation is separated from explicit UI approval;
- approval uses versioned deterministic server contracts and audit events;
- ERP/Edaa remains read-only.

## Release rule

AI context expansion must identify the source domain, purpose, authorization rule and audit behavior. SANAD AI must not become an authorization bypass around Financial or Commercial contracts.


## Agent Runtime v1

The authenticated `/sanad-ai` product is being rebuilt as an agentic operating surface.

Authoritative architecture:
- `docs/architecture/sanad-assistant-agent-runtime-v1.md`
- `src/features/assistant/agentFoundation.ts`

Key decisions:
- primary production model policy: `gemini-3.8-flash`;
- new web agent uses Gemini Interactions API, not the legacy generateContent flow;
- tool-first factual grounding;
- no free SQL and no raw ERP rows;
- currencies stay separate;
- customer identity must be resolved before ERP statements;
- ERP/Edaa remains read-only;
- Action Integration v1 follows Draft -> Review -> explicit UI approval -> deterministic SANAD command -> audit.
