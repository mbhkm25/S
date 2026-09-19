# SANAD AI Domain

Status: agent-runtime foundation defined on current `main`; production assistant remains read-only until the new authenticated Agent Runtime passes eval and release gates.

## Product boundary

SANAD AI consumes authorized context from other SANAD domains. In the current phase it does not create, post, settle or reverse financial/commercial transactions.

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
- financial write tools remain out of scope until an approval/action policy is designed and separately tested.

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
- v1 remains read-only;
- future writes require Draft -> Review -> explicit approval -> deterministic command.
