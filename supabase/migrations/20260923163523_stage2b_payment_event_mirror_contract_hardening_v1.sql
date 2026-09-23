-- Stage 2B Data Train D3 / Payment Event Mirror Contract Hardening
-- business_payment_inbox_events can emit more event types than operation_events historically allowed.
-- The mirror trigger prefixes every inbox event with business_payment_, so the target CHECK must accept the full source taxonomy.

alter table public.operation_events
  drop constraint if exists operation_events_event_type_check;

alter table public.operation_events
  add constraint operation_events_event_type_check
  check (event_type = any (array[
    'created'::text,
    'file_uploaded'::text,
    'qr_created'::text,
    'opened'::text,
    'file_opened'::text,
    'uploader_linked'::text,
    'verification_saved'::text,
    'verified'::text,
    'ai_started'::text,
    'ai_completed'::text,
    'ai_failed'::text,
    'report_requested'::text,
    'report_sent'::text,
    'report_failed'::text,
    'webhook_updated'::text,
    'verification_recorded'::text,
    'business_payment_enqueued'::text,
    'business_payment_claimed'::text,
    'business_payment_claim_renewed'::text,
    'business_payment_claim_conflict'::text,
    'business_payment_released'::text,
    'business_payment_completed'::text,
    'business_payment_review_required'::text,
    'business_payment_review_resumed'::text,
    'business_payment_rejected'::text,
    'business_payment_cancelled'::text,
    'business_payment_reassigned'::text,
    'business_payment_expired_claim_released'::text,
    'business_payment_stale_action_rejected'::text
  ]));

comment on constraint operation_events_event_type_check on public.operation_events is
'Allows the complete business_payment_inbox_events taxonomy mirrored by private.mirror_business_payment_event_to_operation().';
