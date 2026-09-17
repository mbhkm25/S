create or replace function public.get_my_account_center_v1()
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'authentication_required';
  end if;

  select jsonb_build_object(
    'profile', coalesce((
      select jsonb_build_object(
        'id', p.id,
        'full_name', p.full_name,
        'phone', p.phone,
        'avatar_path', p.avatar_path,
        'status', p.status,
        'governorate', p.governorate,
        'profile_completed_at', p.profile_completed_at,
        'phone_verification_status', p.phone_verification_status,
        'phone_verified_at', p.phone_verified_at
      )
      from public.profiles p where p.id=v_user
    ), '{}'::jsonb),
    'subscription', coalesce((
      select jsonb_build_object(
        'plan_code', s.plan_code,
        'status', s.status,
        'current_period_start', s.current_period_start,
        'current_period_end', s.current_period_end
      )
      from public.user_subscriptions s
      where s.user_id=v_user
      order by s.created_at desc
      limit 1
    ), '{}'::jsonb),
    'notifications', jsonb_build_object(
      'unread', (select count(*) from public.notifications n where n.recipient_user_id=v_user and n.read_at is null and n.archived_at is null),
      'total_active', (select count(*) from public.notifications n where n.recipient_user_id=v_user and n.archived_at is null)
    ),
    'devices', jsonb_build_object(
      'active_push', (select count(*) from public.push_subscriptions d where d.user_id=v_user and d.is_active=true),
      'last_seen_at', (select max(d.last_seen_at) from public.push_subscriptions d where d.user_id=v_user and d.is_active=true)
    ),
    'businesses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id,
        'name', b.name,
        'slug', b.slug,
        'public_status', b.public_status,
        'verification_status', b.verification_status
      ) order by b.created_at)
      from public.business_profiles b
      where b.owner_user_id=v_user
    ), '[]'::jsonb),
    'finance', jsonb_build_object(
      'active_accounts', (select count(*) from public.personal_finance_accounts a where a.user_id=v_user and a.status='active'),
      'active_budgets', (select count(*) from public.personal_finance_budgets b where b.user_id=v_user and b.status='active'),
      'active_goals', (select count(*) from public.personal_finance_goals g where g.user_id=v_user and g.status='active'),
      'open_obligations', (select count(*) from public.personal_finance_obligations o where o.user_id=v_user and o.status in ('open','partial'))
    ),
    'generated_at', now()
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.get_my_account_center_v1() from public;
grant execute on function public.get_my_account_center_v1() to authenticated;

create or replace function public.get_ai_financial_context_v1(
  p_scope_kind text default 'personal',
  p_business_id uuid default null,
  p_from date default (current_date - 30),
  p_to date default current_date,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit,50),200));
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'authentication_required';
  end if;
  if p_scope_kind not in ('personal','business') then
    raise exception 'invalid_scope_kind';
  end if;
  if p_to < p_from then
    raise exception 'invalid_date_range';
  end if;

  if p_scope_kind='personal' then
    select jsonb_build_object(
      'scope','personal',
      'period',jsonb_build_object('from',p_from,'to',p_to),
      'summary',public.get_my_finance_dashboard_v1(p_from,p_to),
      'recent_transactions',coalesce((
        select jsonb_agg(to_jsonb(q) order by q.transaction_at desc,q.id desc)
        from (
          select t.id,t.transaction_type,t.transaction_at,t.description,t.amount,t.currency,t.status,t.source,t.party_id,t.category_id,t.due_at,t.reference_code
          from public.personal_finance_transactions t
          where t.user_id=v_user and t.transaction_at::date between p_from and p_to
          order by t.transaction_at desc,t.id desc
          limit v_limit
        ) q
      ),'[]'::jsonb),
      'open_obligations',coalesce((
        select jsonb_agg(to_jsonb(q) order by q.due_date nulls last,q.created_at)
        from (
          select o.id,o.obligation_type,o.title,o.original_amount,o.outstanding_amount,o.currency,o.due_date,o.status,o.party_id,o.created_at
          from public.personal_finance_obligations o
          where o.user_id=v_user and o.status in ('open','partial')
          order by o.due_date nulls last,o.created_at
          limit v_limit
        ) q
      ),'[]'::jsonb),
      'active_goals',coalesce((
        select jsonb_agg(to_jsonb(q) order by q.target_date nulls last,q.created_at)
        from (
          select g.id,g.name,g.target_amount,g.current_amount,g.currency,g.target_date,g.status,g.linked_account_id,g.created_at
          from public.personal_finance_goals g
          where g.user_id=v_user and g.status='active'
          order by g.target_date nulls last,g.created_at
          limit v_limit
        ) q
      ),'[]'::jsonb),
      'generated_at',now()
    ) into v_result;
  else
    if p_business_id is null then
      raise exception 'business_id_required';
    end if;
    if not (private.user_is_business_owner(p_business_id,v_user) or private.user_is_active_business_member(p_business_id,v_user)) then
      raise exception 'business_access_denied';
    end if;

    select jsonb_build_object(
      'scope','business',
      'business_id',p_business_id,
      'period',jsonb_build_object('from',p_from,'to',p_to),
      'documents_by_currency',coalesce((
        select jsonb_agg(to_jsonb(x) order by x.currency)
        from (
          select d.currency,
            coalesce(sum(d.total_amount) filter (where d.document_type='sales_invoice' and d.status='posted'),0) sales,
            coalesce(sum(d.total_amount) filter (where d.document_type='purchase_invoice' and d.status='posted'),0) purchases,
            coalesce(sum(d.total_amount) filter (where d.document_type='receipt' and d.status='posted'),0) receipts,
            coalesce(sum(d.total_amount) filter (where d.document_type='payment' and d.status='posted'),0) payments,
            coalesce(sum(d.total_amount) filter (where d.document_type='expense' and d.status='posted'),0) expenses
          from public.business_commercial_documents d
          where d.business_id=p_business_id and d.document_date between p_from and p_to
          group by d.currency
        ) x
      ),'[]'::jsonb),
      'overdue_documents',coalesce((
        select jsonb_agg(to_jsonb(q) order by q.due_date,q.id)
        from (
          select d.id,d.document_type,d.document_number,d.party_id,d.due_date,d.currency,d.total_amount,d.paid_amount,d.payment_status
          from public.business_commercial_documents d
          where d.business_id=p_business_id and d.status='posted' and d.due_date < current_date and d.payment_status in ('unpaid','partial')
          order by d.due_date,d.id
          limit v_limit
        ) q
      ),'[]'::jsonb),
      'recent_activity',coalesce((
        select jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id desc)
        from (
          select a.id,a.event_type,a.title,a.summary,a.amount,a.currency,a.business_date,a.status,a.created_at
          from public.business_activity_events a
          where a.business_id=p_business_id and a.is_current=true
          order by a.created_at desc,a.id desc
          limit v_limit
        ) q
      ),'[]'::jsonb),
      'generated_at',now()
    ) into v_result;
  end if;

  return v_result;
end;
$function$;

revoke all on function public.get_ai_financial_context_v1(text,uuid,date,date,integer) from public;
grant execute on function public.get_ai_financial_context_v1(text,uuid,date,date,integer) to authenticated;
