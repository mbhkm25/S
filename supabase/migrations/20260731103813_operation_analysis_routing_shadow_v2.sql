alter table public.operations
  add column if not exists analysis_contract_version smallint not null default 1,
  add column if not exists analysis_prompt_version integer,
  add column if not exists analysis_completed_at timestamptz,
  add column if not exists financial_entity_code text references public.financial_entities(code),
  add column if not exists document_template text,
  add column if not exists document_template_confidence numeric,
  add column if not exists transaction_direction text,
  add column if not exists transaction_direction_confidence numeric,
  add column if not exists sender_name text,
  add column if not exists receiver_name text,
  add column if not exists sender_account text,
  add column if not exists receiver_account text,
  add column if not exists sender_identifier_type text,
  add column if not exists receiver_identifier_type text,
  add column if not exists document_account text,
  add column if not exists credited_account text,
  add column if not exists debited_account text,
  add column if not exists merchant_point text,
  add column if not exists multiple_operations_present boolean not null default false,
  add column if not exists selected_operation_position smallint,
  add column if not exists field_confidences jsonb not null default '{}'::jsonb,
  add column if not exists field_evidence jsonb not null default '{}'::jsonb,
  add column if not exists routing_shadow_status text not null default 'not_evaluated',
  add column if not exists routing_shadow_score numeric,
  add column if not exists routing_shadow_business_id uuid references public.business_profiles(id),
  add column if not exists routing_shadow_account_id uuid references public.business_financial_accounts(id),
  add column if not exists routing_shadow_strategy text,
  add column if not exists routing_shadow_evaluated_at timestamptz;

alter table public.operations
  add column if not exists sender_name_normalized text
    generated always as (public.normalize_financial_name(sender_name)) stored,
  add column if not exists receiver_name_normalized text
    generated always as (public.normalize_financial_name(receiver_name)) stored,
  add column if not exists sender_account_normalized text
    generated always as (public.normalize_financial_identifier(sender_account)) stored,
  add column if not exists receiver_account_normalized text
    generated always as (public.normalize_financial_identifier(receiver_account)) stored,
  add column if not exists document_account_normalized text
    generated always as (public.normalize_financial_identifier(document_account)) stored,
  add column if not exists credited_account_normalized text
    generated always as (public.normalize_financial_identifier(credited_account)) stored,
  add column if not exists debited_account_normalized text
    generated always as (public.normalize_financial_identifier(debited_account)) stored,
  add column if not exists merchant_point_normalized text
    generated always as (public.normalize_financial_identifier(merchant_point)) stored;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'operations_document_template_check') then
    alter table public.operations add constraint operations_document_template_check
      check (document_template is null or document_template in (
        'single_receipt','transaction_list','account_history','wallet_receipt',
        'transfer_receipt','statement','unknown'
      ));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'operations_transaction_direction_check') then
    alter table public.operations add constraint operations_transaction_direction_check
      check (transaction_direction is null or transaction_direction in ('incoming','outgoing','internal','unknown'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'operations_sender_identifier_type_check') then
    alter table public.operations add constraint operations_sender_identifier_type_check
      check (sender_identifier_type is null or sender_identifier_type in (
        'account_number','wallet_number','financial_line','merchant_point',
        'terminal_number','phone_number','iban','other','unknown'
      ));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'operations_receiver_identifier_type_check') then
    alter table public.operations add constraint operations_receiver_identifier_type_check
      check (receiver_identifier_type is null or receiver_identifier_type in (
        'account_number','wallet_number','financial_line','merchant_point',
        'terminal_number','phone_number','iban','other','unknown'
      ));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'operations_document_template_confidence_check') then
    alter table public.operations add constraint operations_document_template_confidence_check
      check (document_template_confidence is null or document_template_confidence between 0 and 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'operations_transaction_direction_confidence_check') then
    alter table public.operations add constraint operations_transaction_direction_confidence_check
      check (transaction_direction_confidence is null or transaction_direction_confidence between 0 and 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'operations_selected_operation_position_check') then
    alter table public.operations add constraint operations_selected_operation_position_check
      check (selected_operation_position is null or selected_operation_position between 1 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'operations_field_confidences_object_check') then
    alter table public.operations add constraint operations_field_confidences_object_check
      check (jsonb_typeof(field_confidences) = 'object');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'operations_field_evidence_object_check') then
    alter table public.operations add constraint operations_field_evidence_object_check
      check (jsonb_typeof(field_evidence) = 'object');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'operations_routing_shadow_status_check') then
    alter table public.operations add constraint operations_routing_shadow_status_check
      check (routing_shadow_status in (
        'not_evaluated','skipped','insufficient_data','no_match','ambiguous',
        'low_confidence_match','probable_match','high_confidence_match','error'
      ));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'operations_routing_shadow_score_check') then
    alter table public.operations add constraint operations_routing_shadow_score_check
      check (routing_shadow_score is null or routing_shadow_score between 0 and 100);
  end if;
end $$;

create index if not exists operations_financial_entity_receiver_idx
  on public.operations (financial_entity_code, receiver_account_normalized)
  where receiver_account_normalized is not null;

create index if not exists operations_financial_entity_document_account_idx
  on public.operations (financial_entity_code, document_account_normalized)
  where document_account_normalized is not null;

create index if not exists operations_financial_entity_merchant_point_idx
  on public.operations (financial_entity_code, merchant_point_normalized)
  where merchant_point_normalized is not null;

create index if not exists operations_routing_shadow_status_idx
  on public.operations (routing_shadow_status, routing_shadow_score desc, created_at desc);

create table if not exists public.operation_routing_shadow_runs (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.operations(id) on delete cascade,
  algorithm_version text not null,
  analysis_contract_version smallint not null,
  financial_entity_code text references public.financial_entities(code),
  status text not null check (status in (
    'skipped','insufficient_data','no_match','ambiguous','low_confidence_match',
    'probable_match','high_confidence_match','error'
  )),
  matched_business_id uuid references public.business_profiles(id),
  matched_account_id uuid references public.business_financial_accounts(id),
  match_score numeric check (match_score is null or match_score between 0 and 100),
  match_strategy text,
  candidate_count integer not null default 0 check (candidate_count >= 0),
  candidates jsonb not null default '[]'::jsonb check (jsonb_typeof(candidates) = 'array'),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  reason_codes jsonb not null default '[]'::jsonb check (jsonb_typeof(reason_codes) = 'array'),
  created_at timestamptz not null default now()
);

alter table public.operation_routing_shadow_runs enable row level security;
revoke all on table public.operation_routing_shadow_runs from public, anon, authenticated;
grant select, insert on table public.operation_routing_shadow_runs to service_role;

create index if not exists operation_routing_shadow_runs_operation_idx
  on public.operation_routing_shadow_runs (operation_id, created_at desc);

create index if not exists operation_routing_shadow_runs_status_idx
  on public.operation_routing_shadow_runs (status, match_score desc, created_at desc);

create or replace function public.evaluate_operation_financial_routing_shadow(
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_operation public.operations%rowtype;
  v_entity_code text;
  v_candidates jsonb := '[]'::jsonb;
  v_candidate_count integer := 0;
  v_top_score numeric;
  v_second_score numeric;
  v_top_business_id uuid;
  v_top_account_id uuid;
  v_top_strategy text;
  v_status text;
  v_reason_codes jsonb := '[]'::jsonb;
  v_evidence jsonb := '{}'::jsonb;
  v_run_id uuid;
begin
  select * into v_operation
  from public.operations
  where id = p_operation_id;

  if not found then
    raise exception 'operation_not_found';
  end if;

  v_entity_code := coalesce(
    v_operation.financial_entity_code,
    public.resolve_financial_entity_code(v_operation.financial_entity)
  );

  if v_operation.ai_status <> 'completed' then
    v_status := 'skipped';
    v_reason_codes := jsonb_build_array('analysis_not_completed','shadow_only');
  elsif coalesce(v_operation.structured_data->>'is_financial_document','true') = 'false' then
    v_status := 'skipped';
    v_reason_codes := jsonb_build_array('non_financial_document','shadow_only');
  elsif v_entity_code is null or v_entity_code in ('unknown','other') then
    v_status := 'insufficient_data';
    v_reason_codes := jsonb_build_array('financial_entity_not_routable','shadow_only');
  else
    with source_identifiers(role, value_normalized, inferred_type, base_score, field_confidence) as (
      values
        ('merchant_point', v_operation.merchant_point_normalized, 'merchant_point', 98::numeric,
          coalesce(nullif(v_operation.field_confidences->>'merchant_point','')::numeric, v_operation.ai_confidence_score, 0.5)),
        ('credited_account', v_operation.credited_account_normalized, 'account_number', 97::numeric,
          coalesce(nullif(v_operation.field_confidences->>'credited_account','')::numeric, v_operation.ai_confidence_score, 0.5)),
        ('receiver_account', v_operation.receiver_account_normalized, coalesce(v_operation.receiver_identifier_type,'unknown'), 95::numeric,
          coalesce(nullif(v_operation.field_confidences->>'receiver_account','')::numeric, v_operation.ai_confidence_score, 0.5)),
        ('document_account', v_operation.document_account_normalized, 'account_number', 92::numeric,
          coalesce(nullif(v_operation.field_confidences->>'document_account','')::numeric, v_operation.ai_confidence_score, 0.5)),
        ('debited_account', case when v_operation.transaction_direction = 'outgoing' then v_operation.debited_account_normalized end, 'account_number', 97::numeric,
          coalesce(nullif(v_operation.field_confidences->>'debited_account','')::numeric, v_operation.ai_confidence_score, 0.5)),
        ('sender_account', case when v_operation.transaction_direction = 'outgoing' then v_operation.sender_account_normalized end, coalesce(v_operation.sender_identifier_type,'unknown'), 95::numeric,
          coalesce(nullif(v_operation.field_confidences->>'sender_account','')::numeric, v_operation.ai_confidence_score, 0.5))
    ),
    valid_sources as (
      select role, value_normalized, inferred_type, base_score,
             greatest(0::numeric, least(1::numeric, field_confidence)) as field_confidence
      from source_identifiers
      where value_normalized is not null and length(value_normalized) >= 3
    ),
    raw_matches as (
      select
        a.id as account_id,
        a.business_id,
        i.id as identifier_id,
        i.identifier_type,
        s.role,
        s.field_confidence,
        least(
          100::numeric,
          round(
            s.base_score * (0.70 + 0.30 * s.field_confidence)
            + case when i.currency is null or v_operation.currency is null then 0
                   when i.currency = v_operation.currency then 2 else -2 end
            + case when s.inferred_type in ('unknown','other') then 0
                   when i.identifier_type = s.inferred_type then 2 else 0 end
            + case when i.verification_status = 'verified' then 1 else 0 end,
            2
          )
        ) as score
      from valid_sources s
      join public.business_financial_identifiers i
        on i.identifier_value_normalized = s.value_normalized
       and i.status = 'active'
       and i.routing_enabled = true
      join public.business_financial_accounts a
        on a.id = i.financial_account_id
       and a.status = 'active'
       and a.routing_enabled = true
       and a.financial_entity_code = v_entity_code
    ),
    aggregated as (
      select
        account_id,
        business_id,
        max(score) as score,
        (array_agg(role order by score desc, role))[1] as strategy,
        jsonb_agg(
          jsonb_build_object(
            'source_role', role,
            'identifier_type', identifier_type,
            'field_confidence', field_confidence,
            'score', score
          ) order by score desc, role
        ) as match_evidence
      from raw_matches
      group by account_id, business_id
    ),
    ranked as (
      select *, row_number() over (order by score desc, account_id) as rank_no
      from aggregated
    )
    select
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'account_id', account_id,
            'business_id', business_id,
            'score', score,
            'strategy', strategy,
            'evidence', match_evidence
          ) order by rank_no
        ) filter (where rank_no <= 5),
        '[]'::jsonb
      ),
      count(*)::integer,
      max(score) filter (where rank_no = 1),
      max(score) filter (where rank_no = 2),
      max(account_id) filter (where rank_no = 1),
      max(business_id) filter (where rank_no = 1),
      max(strategy) filter (where rank_no = 1)
    into
      v_candidates,
      v_candidate_count,
      v_top_score,
      v_second_score,
      v_top_account_id,
      v_top_business_id,
      v_top_strategy
    from ranked;

    if not exists (
      select 1
      from (values
        (v_operation.merchant_point_normalized),
        (v_operation.credited_account_normalized),
        (v_operation.receiver_account_normalized),
        (v_operation.document_account_normalized),
        (case when v_operation.transaction_direction = 'outgoing' then v_operation.debited_account_normalized end),
        (case when v_operation.transaction_direction = 'outgoing' then v_operation.sender_account_normalized end)
      ) as identifiers(value_normalized)
      where value_normalized is not null and length(value_normalized) >= 3
    ) then
      v_status := 'insufficient_data';
      v_reason_codes := jsonb_build_array('no_routing_identifier_extracted','shadow_only');
    elsif v_candidate_count = 0 then
      v_status := 'no_match';
      v_reason_codes := jsonb_build_array('no_enabled_identifier_match','shadow_only');
    elsif v_candidate_count > 1 and coalesce(v_top_score,0) = coalesce(v_second_score,-1) then
      v_status := 'ambiguous';
      v_reason_codes := jsonb_build_array('top_candidates_tied','shadow_only');
    elsif coalesce(v_top_score,0) >= 95 and (v_second_score is null or v_top_score - v_second_score >= 3) then
      v_status := 'high_confidence_match';
      v_reason_codes := jsonb_build_array('unique_exact_identifier_match','shadow_only');
    elsif coalesce(v_top_score,0) >= 88 and (v_second_score is null or v_top_score - v_second_score >= 8) then
      v_status := 'probable_match';
      v_reason_codes := jsonb_build_array('probable_exact_identifier_match','shadow_only');
    else
      v_status := 'low_confidence_match';
      v_reason_codes := jsonb_build_array('weak_or_competing_identifier_match','shadow_only');
    end if;

    v_evidence := jsonb_build_object(
      'document_template', v_operation.document_template,
      'transaction_direction', v_operation.transaction_direction,
      'currency', v_operation.currency,
      'candidate_fields_present', jsonb_strip_nulls(jsonb_build_object(
        'merchant_point', v_operation.merchant_point_normalized is not null,
        'credited_account', v_operation.credited_account_normalized is not null,
        'receiver_account', v_operation.receiver_account_normalized is not null,
        'document_account', v_operation.document_account_normalized is not null,
        'debited_account', v_operation.debited_account_normalized is not null,
        'sender_account', v_operation.sender_account_normalized is not null
      ))
    );
  end if;

  if v_status not in ('high_confidence_match','probable_match','low_confidence_match','ambiguous') then
    v_top_business_id := null;
    v_top_account_id := null;
    v_top_score := null;
    v_top_strategy := null;
  end if;

  insert into public.operation_routing_shadow_runs (
    operation_id,
    algorithm_version,
    analysis_contract_version,
    financial_entity_code,
    status,
    matched_business_id,
    matched_account_id,
    match_score,
    match_strategy,
    candidate_count,
    candidates,
    evidence,
    reason_codes
  ) values (
    v_operation.id,
    'routing-shadow-v2.0',
    v_operation.analysis_contract_version,
    v_entity_code,
    v_status,
    v_top_business_id,
    v_top_account_id,
    v_top_score,
    v_top_strategy,
    v_candidate_count,
    v_candidates,
    v_evidence,
    v_reason_codes
  ) returning id into v_run_id;

  update public.operations
  set financial_entity_code = coalesce(financial_entity_code, v_entity_code),
      routing_shadow_status = v_status,
      routing_shadow_score = v_top_score,
      routing_shadow_business_id = v_top_business_id,
      routing_shadow_account_id = v_top_account_id,
      routing_shadow_strategy = v_top_strategy,
      routing_shadow_evaluated_at = now(),
      updated_at = now()
  where id = v_operation.id;

  return jsonb_build_object(
    'ok', true,
    'shadow_only', true,
    'run_id', v_run_id,
    'operation_id', v_operation.id,
    'status', v_status,
    'financial_entity_code', v_entity_code,
    'candidate_count', v_candidate_count,
    'match_score', v_top_score,
    'match_strategy', v_top_strategy,
    'matched_business_id', v_top_business_id,
    'matched_account_id', v_top_account_id,
    'reason_codes', v_reason_codes
  );
end;
$$;

revoke all on function public.evaluate_operation_financial_routing_shadow(uuid) from public, anon, authenticated;
grant execute on function public.evaluate_operation_financial_routing_shadow(uuid) to service_role;

update public.operations
set analysis_contract_version = 1,
    financial_entity_code = public.resolve_financial_entity_code(financial_entity),
    sender_name = coalesce(sender_name, nullif(structured_data->>'sender_name','')),
    receiver_name = coalesce(receiver_name, nullif(structured_data->>'receiver_name','')),
    sender_account = coalesce(sender_account, nullif(structured_data->>'sender_account','')),
    receiver_account = coalesce(receiver_account, nullif(structured_data->>'receiver_account','')),
    transaction_direction = coalesce(transaction_direction, 'unknown'),
    document_template = coalesce(document_template, 'unknown'),
    multiple_operations_present = coalesce(
      case when structured_data->'sanad_attention_points' @> '["تم استخراج العملية العلوية فقط من قائمة عمليات متعددة."]'::jsonb then true end,
      false
    ),
    selected_operation_position = coalesce(selected_operation_position, 1),
    analysis_completed_at = coalesce(analysis_completed_at, updated_at)
where ai_status = 'completed';

do $$
declare
  v_row record;
begin
  for v_row in
    select id from public.operations where ai_status = 'completed'
  loop
    begin
      perform public.evaluate_operation_financial_routing_shadow(v_row.id);
    exception when others then
      update public.operations
      set routing_shadow_status = 'error',
          routing_shadow_evaluated_at = now(),
          updated_at = now()
      where id = v_row.id;
    end;
  end loop;
end $$;
