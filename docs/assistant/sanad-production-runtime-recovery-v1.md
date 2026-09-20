# SANAD Production Runtime Recovery v1

## Incident

The SANAD Agent frontend reached production before the backend contract introduced by later stages.

Observed production failures included:
- missing `list_my_sanad_agent_attachments_v1` in PostgREST schema cache;
- missing private attachment bucket;
- unavailable voice transcription function;
- unavailable attachment analysis function.

## Production repair

Applied production migrations:
- `20260920121801_sanad_agent_message_feedback_v1`
- `20260920121807_sanad_agent_attachments_v1`
- `20260920121815_sanad_agent_actions_v1`
- `20260920121821_sanad_agent_observability_v1`

The local migration filenames are aligned to the versions recorded by the production migration ledger.

Deployed production Edge Functions:
- `sanad-ai-agent-v1` v5
- `sanad-ai-transcribe-v1` v1
- `sanad-ai-attachment-analyze-v1` v1

All three require JWT.

The PostgREST schema cache was explicitly reloaded after applying the migrations.

## Verified production contract

Verified in production:
- attachment list/create RPCs exist;
- action approval RPC exists;
- performance metric RPC exists;
- `sanad-agent-attachments` bucket exists, is private and has a 20 MiB limit;
- user-owned attachment/action/performance RLS policies exist;
- storage insert/select/delete policies exist;
- authenticated list RPCs execute for an existing SANAD Agent thread;
- observability is already receiving production thread-load metrics.

## Release guard

Frontend production deployment now fails closed before SSH deployment unless:
- required SANAD Agent migrations are aligned in the linked production migration ledger;
- required SANAD Agent Edge Functions exist in the production function inventory.

This prevents the PWA from being promoted ahead of the backend contract.

The guard uses production-scoped GitHub secrets only inside the protected production environment and does not print credentials.
