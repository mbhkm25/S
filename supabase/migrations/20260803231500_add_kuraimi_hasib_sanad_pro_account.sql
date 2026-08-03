do $$
begin
  if exists (
    select 1
    from public.sanad_payment_accounts
    where account_number = '825121'
  ) then
    update public.sanad_payment_accounts
    set financial_entity = 'نقطة حاسب الكريمي',
        account_holder_name = 'SANAD',
        currency = 'YER',
        status = 'active',
        display_order = 15,
        instructions = 'أودع رسوم سند Pro إلى هذا الحساب ثم ارفع إشعار الحوالة.',
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'account_type', 'merchant_point',
          'financial_entity_code', 'alkuraimi_hasib'
        ),
        updated_at = now()
    where account_number = '825121';
  else
    insert into public.sanad_payment_accounts (
      financial_entity,
      account_number,
      account_holder_name,
      currency,
      status,
      display_order,
      instructions,
      metadata
    ) values (
      'نقطة حاسب الكريمي',
      '825121',
      'SANAD',
      'YER',
      'active',
      15,
      'أودع رسوم سند Pro إلى هذا الحساب ثم ارفع إشعار الحوالة.',
      jsonb_build_object(
        'account_type', 'merchant_point',
        'financial_entity_code', 'alkuraimi_hasib'
      )
    );
  end if;
end
$$;
