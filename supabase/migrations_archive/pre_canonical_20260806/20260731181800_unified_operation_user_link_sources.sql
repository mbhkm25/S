-- Preserve legacy operation-user link sources and add unified workflow entry points.
alter table public.operation_user_links
  drop constraint if exists operation_user_links_source_check;

alter table public.operation_user_links
  add constraint operation_user_links_source_check
  check (
    source in (
      'system','pwa_upload','share_target','qr_scan','token_open','manual','whatsapp','api',
      'payment_inbox','qr_details','direct_link','operation_details',
      'business_link_after_verification','notification','admin'
    )
  );
