-- Preserve all legacy event types and add every unified workflow timeline event.
alter table public.operation_events
  drop constraint if exists operation_events_event_type_check;

alter table public.operation_events
  add constraint operation_events_event_type_check
  check (
    event_type in (
      'created','file_uploaded','qr_created','opened','file_opened',
      'uploader_linked','verification_saved','verified',
      'ai_started','ai_completed','ai_failed',
      'report_requested','report_sent','report_failed','webhook_updated',
      'verification_recorded',
      'business_payment_enqueued',
      'business_payment_claimed',
      'business_payment_claim_renewed',
      'business_payment_expired_claim_released',
      'business_payment_released',
      'business_payment_completed',
      'business_payment_rejected',
      'business_payment_cancelled',
      'business_payment_reassigned'
    )
  );
