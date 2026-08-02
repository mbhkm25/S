begin;

drop function if exists public.get_my_operations(text,timestamptz,timestamptz,integer,integer);

create function public.get_my_operations(
  p_relation_type text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table(
  operation_id uuid,
  public_token uuid,
  relation_type text,
  status text,
  ai_status text,
  summary text,
  amount numeric,
  currency text,
  financial_entity text,
  reference_number text,
  transaction_type text,
  created_at timestamptz,
  relation_created_at timestamptz,
  verified_at timestamptz,
  confidence_score numeric,
  sanad_risk_level text,
  possible_fraud boolean
)
language sql
stable
security invoker
set search_path=''
as $function$
  select
    o.id,
    o.public_token,
    l.relation_type,
    o.status,
    o.ai_status,
    o.summary,
    o.amount,
    o.currency,
    o.financial_entity,
    o.reference_number,
    o.transaction_type,
    o.created_at,
    l.created_at,
    o.verified_at,
    o.confidence_score,
    o.sanad_risk_level,
    o.possible_fraud
  from public.operation_user_links l
  join public.operations o on o.id=l.operation_id
  where l.user_id=(select auth.uid())
    and (p_relation_type is null or l.relation_type=p_relation_type)
    and (p_from is null or o.created_at>=p_from)
    and (p_to is null or o.created_at<p_to)
  order by greatest(o.created_at,l.last_seen_at) desc
  limit greatest(1,least(coalesce(p_limit,100),200))
  offset greatest(0,coalesce(p_offset,0));
$function$;

create or replace function public.get_my_operations_v2(
  p_relation_type text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table(
  operation_id uuid,
  public_token uuid,
  relation_type text,
  status text,
  ai_status text,
  summary text,
  amount numeric,
  currency text,
  financial_entity text,
  reference_number text,
  transaction_type text,
  created_at timestamptz,
  relation_created_at timestamptz,
  verified_at timestamptz,
  confidence_score numeric,
  sanad_risk_level text,
  possible_fraud boolean,
  raw_receiver_name text,
  resolved_business_name text,
  resolved_account_holder_name text,
  identity_source text,
  identity_confidence numeric,
  has_name_conflict boolean,
  match_strategy text,
  match_score numeric
)
language sql
stable
security invoker
set search_path=''
as $function$
  select *
  from public.get_my_operations_identity_semantic_core(
    p_relation_type,p_from,p_to,p_limit,p_offset
  );
$function$;

revoke all on function public.get_my_operations(text,timestamptz,timestamptz,integer,integer) from public,anon;
revoke all on function public.get_my_operations_v2(text,timestamptz,timestamptz,integer,integer) from public,anon;
grant execute on function public.get_my_operations(text,timestamptz,timestamptz,integer,integer) to authenticated;
grant execute on function public.get_my_operations_v2(text,timestamptz,timestamptz,integer,integer) to authenticated;

comment on function public.get_my_operations(text,timestamptz,timestamptz,integer,integer) is
'Personal operation feed based only on operation_user_links. It does not expose business inbox membership or business routing context.';
comment on function public.get_my_operations_v2(text,timestamptz,timestamptz,integer,integer) is
'Optional enriched personal feed. Business payment inbox remains a separate contract.';

notify pgrst,'reload schema';
commit;