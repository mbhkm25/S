begin;

alter table public.business_payment_inbox
  drop constraint if exists business_payment_inbox_check2;

alter table public.business_payment_inbox
  add constraint business_payment_inbox_check2
  check (
    (released_at is null and released_by_user_id is null)
    or
    (released_at is not null and released_by_user_id is not null)
    or
    (
      released_at is not null
      and released_by_user_id is null
      and release_reason = 'claim_expired'
    )
  );

comment on constraint business_payment_inbox_check2 on public.business_payment_inbox is
  'Manual releases require an actor; automatic claim expiry may record released_at with no user when release_reason=claim_expired.';

commit;
