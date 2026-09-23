-- Stage 2B Runtime R1 / Shared attachment lookup index v1
-- Required by participant-wide attachment listing and thread cleanup.

create index if not exists sanad_agent_attachments_thread_created_idx
  on public.sanad_agent_attachments(thread_id,created_at,id)
  where status <> 'deleted';

comment on index public.sanad_agent_attachments_thread_created_idx is
'Supports participant-aware thread attachment listing without scanning uploader-scoped rows.';
