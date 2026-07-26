begin;

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (notification_type = any (array[
    'operation_received'::text,
    'operation_analysis_completed'::text,
    'operation_analysis_failed'::text,
    'operation_needs_review'::text,
    'operation_verified'::text,
    'report_requested'::text,
    'report_ready'::text,
    'report_failed'::text,
    'business_invitation_received'::text,
    'business_invitation_accepted'::text,
    'business_member_status_changed'::text,
    'business_operation_linked'::text,
    'business_review_approved'::text,
    'business_review_rejected'::text,
    'pro_payment_submitted'::text,
    'pro_payment_approved'::text,
    'pro_payment_rejected'::text,
    'subscription_expiring'::text,
    'subscription_expired'::text,
    'system_announcement'::text
  ]));

commit;
