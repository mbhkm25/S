-- SANAD Transaction Identity & Reuse Detection — Shadow v1
-- This migration is intentionally non-enforcing: it records deterministic identity
-- signals and historical matches without changing operation creation, routing,
-- Payment Inbox behavior, or subscription usage.

alter table public.operations
  add column if not exists identity_version smallint not null default 1,
  add column if not exists normalized_reference_number text,
  add column if not exists transaction_identity_key text,
  add column if not exists transaction_fingerprint text,
  add column if not exists identity_status text not null default 'pending',
  add column if not exists identity_confidence numeric(6,5),
  add column if not exists identity_evidence jsonb not null default '{}'::jsonb,
  add column if not exists identity_evaluated_at timestamptz;

alter table public.operations
  drop constraint if exists operations_identity_status_check;
alter table public.operations
  add constraint operations_identity_status_check
  check (identity_status in ('pending','unique_candidate','exact_duplicate','probable_duplicate','identity_insufficient'));

alter table public.operations
  drop constraint if exists operations_identity_confidence_check;
alter table public.operations
  add constraint operations_identity_confidence_check
  check (identity_confidence is null or (identity_confidence >= 0 and identity_confidence <= 1));

create index if not exists operations_transaction_identity_key_idx
  on public.operations (transaction_identity_key)
  where transaction_identity_key is not null;

create index if not exists operations_transaction_fingerprint_idx
  on public.operations (transaction_fingerprint)
  where transaction_fingerprint is not null;

create index if not exists operations_identity_status_created_idx
  on public.operations (identity_status, created_at desc);

create table if not exists private.operation_identity_shadow_runs (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.operations(id) on delete cascade,
  identity_version smallint not null default 1,
  entity_code text,
  normalized_reference_number text,
  destination_identifier text,
  transaction_identity_key text,
  transaction_fingerprint text,
  match_type text not null,
  candidate_operation_id uuid references public.operations(id) on delete set null,
  canonical_operation_id uuid references public.operations(id) on delete set null,
  confidence numeric(6,5),
  evidence jsonb not null default '{}'::jsonb,
  evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint operation_identity_shadow_runs_match_type_check
    check (match_type in ('unique_candidate','exact_duplicate','probable_duplicate','identity_insufficient')),
  constraint operation_identity_shadow_runs_confidence_check
    check (confidence is null or (confidence >= 0 and confidence <= 1))
);

create unique index if not exists operation_identity_shadow_runs_operation_version_uidx
  on private.operation_identity_shadow_runs (operation_id, identity_version);
create index if not exists operation_identity_shadow_runs_candidate_idx
  on private.operation_identity_shadow_runs (candidate_operation_id)
  where candidate_operation_id is not null;
create index if not exists operation_identity_shadow_runs_canonical_idx
  on private.operation_identity_shadow_runs (canonical_operation_id)
  where canonical_operation_id is not null;
create index if not exists operation_identity_shadow_runs_match_type_idx
  on private.operation_identity_shadow_runs (match_type, evaluated_at desc);

create table if not exists private.operation_submissions (
  id uuid primary key default gen_random_uuid(),
  submitted_operation_id uuid not null references public.operations(id) on delete cascade,
  canonical_operation_id uuid references public.operations(id) on delete set null,
  source text not null,
  source_message_id text,
  submitted_by_user_id uuid,
  submitted_by_phone text,
  file_sha256 text,
  identity_version smallint not null default 1,
  identity_match_type text not null default 'pending',
  matched_operation_id uuid references public.operations(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operation_submissions_match_type_check
    check (identity_match_type in ('pending','unique_candidate','exact_duplicate','probable_duplicate','identity_insufficient'))
);

create unique index if not exists operation_submissions_operation_uidx
  on private.operation_submissions (submitted_operation_id);
create index if not exists operation_submissions_canonical_idx
  on private.operation_submissions (canonical_operation_id)
  where canonical_operation_id is not null;
create index if not exists operation_submissions_source_message_idx
  on private.operation_submissions (source, source_message_id)
  where source_message_id is not null;
create index if not exists operation_submissions_match_type_idx
  on private.operation_submissions (identity_match_type, created_at desc);

alter table private.operation_identity_shadow_runs enable row level security;
alter table private.operation_submissions enable row level security;
revoke all on private.operation_identity_shadow_runs from public, anon, authenticated;
revoke all on private.operation_submissions from public, anon, authenticated;

create or replace function private.sanad_identity_normalize_digits(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_value is null then null
    else translate(p_value, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789')
  end;
$$;

create or replace function private.sanad_identity_normalize_reference(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    upper(
      regexp_replace(
        regexp_replace(
          private.sanad_identity_normalize_digits(coalesce(p_value,'')),
          '[\u200E\u200F\u202A-\u202E\u2066-\u2069]', '', 'g'
        ),
        '[[:space:]]+', '', 'g'
      )
    ),
    ''
  );
$$;

create or replace function private.sanad_identity_normalize_identifier(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    upper(
      regexp_replace(
        private.sanad_identity_normalize_digits(coalesce(p_value,'')),
        '[^0-9A-Za-z]+', '', 'g'
      )
    ),
    ''
  );
$$;

create or replace function private.sanad_identity_entity_code(p_code text, p_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_code text := lower(nullif(btrim(coalesce(p_code,'')),''));
  v_name text := lower(coalesce(p_name,''));
begin
  if v_code is not null and v_code not in ('unknown','other') then
    return v_code;
  end if;

  if v_name like '%عمقي%' or v_name like '%alomq%' or v_name like '%alamq%' then return 'alomqy_mobile'; end if;
  if v_name like '%بسيري%' or v_name like '%busa%' or v_name like '%basa%' then return 'albusaery_mobile'; end if;
  if (v_name like '%كريمي%' or v_name like '%kuraimi%') and (v_name like '%حاسب%' or v_name like '%haseb%' or v_name like '%hasib%') then return 'kuraimi_haseb'; end if;
  if (v_name like '%كريمي%' or v_name like '%kuraimi%') and (v_name like '%سعود%' or v_name like '%sar%') then return 'kuraimi_sar'; end if;
  if (v_name like '%كريمي%' or v_name like '%kuraimi%') and (v_name like '%يمن%' or v_name like '%yer%') then return 'kuraimi_yer'; end if;
  if (v_name like '%بن دول%' or v_name like '%bin dowal%' or v_name like '%bindowal%') and (v_name like '%باي%' or v_name like '%pay%') then return 'bin_dowal_pay'; end if;
  if v_name like '%بن دول%' or v_name like '%bin dowal%' or v_name like '%bindowal%' then return 'bin_dowal_exchange'; end if;
  if v_name like '%بي كاش%' or v_name like '%بيكاش%' or v_name like '%bcash%' then return 'bcash_wallet'; end if;

  return v_code;
end;
$$;

create or replace function private.evaluate_operation_identity_shadow(p_operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_op public.operations%rowtype;
  v_entity text;
  v_ref text;
  v_destination text;
  v_identity_key text;
  v_fingerprint text;
  v_match_type text;
  v_candidate uuid;
  v_canonical uuid;
  v_confidence numeric(6,5);
  v_evidence jsonb := '{}'::jsonb;
  v_currency text;
  v_amount text;
begin
  select * into v_op
  from public.operations
  where id = p_operation_id
  for update;

  if not found then
    return jsonb_build_object('ok',false,'reason','operation_not_found');
  end if;

  if v_op.ai_status <> 'completed' then
    update public.operations
    set identity_status='pending', identity_version=1
    where id=v_op.id;
    return jsonb_build_object('ok',true,'status','pending');
  end if;

  v_entity := private.sanad_identity_entity_code(v_op.financial_entity_code, v_op.financial_entity);
  v_ref := private.sanad_identity_normalize_reference(v_op.reference_number);
  v_destination := private.sanad_identity_normalize_identifier(
    coalesce(v_op.merchant_point_normalized, v_op.merchant_point, v_op.receiver_account_normalized, v_op.receiver_account)
  );
  v_currency := upper(nullif(btrim(coalesce(v_op.currency,'')),''));
  v_amount := case when v_op.amount is null then null else v_op.amount::text end;

  if v_entity is null or v_ref is null then
    v_match_type := 'identity_insufficient';
    v_confidence := 0;
    v_evidence := jsonb_build_object(
      'reason','missing_entity_or_reference',
      'entity_present',v_entity is not null,
      'reference_present',v_ref is not null,
      'shadow_mode',true
    );
  else
    v_identity_key := v_entity || '|' || v_ref;

    if v_destination is not null and v_amount is not null and v_currency is not null then
      v_fingerprint := encode(
        extensions.digest(v_identity_key || '|' || v_destination || '|' || v_amount || '|' || v_currency, 'sha256'),
        'hex'
      );
    end if;

    if nullif(btrim(coalesce(v_op.file_sha256,'')),'') is not null then
      select o.id,
             case when r.match_type='exact_duplicate' and r.canonical_operation_id is not null
                  then r.canonical_operation_id else o.id end
      into v_candidate, v_canonical
      from public.operations o
      left join private.operation_identity_shadow_runs r
        on r.operation_id=o.id and r.identity_version=1
      where o.id<>v_op.id
        and o.created_at<=v_op.created_at
        and nullif(btrim(coalesce(o.file_sha256,'')),'')=btrim(v_op.file_sha256)
      order by o.created_at,o.id
      limit 1;
    end if;

    if v_candidate is not null then
      v_match_type := 'exact_duplicate';
      v_confidence := 1;
      v_evidence := jsonb_build_object(
        'strategy','file_sha256',
        'same_file',true,
        'same_entity_reference',true,
        'shadow_mode',true
      );
    elsif v_fingerprint is not null then
      select o.id,
             case when r.match_type='exact_duplicate' and r.canonical_operation_id is not null
                  then r.canonical_operation_id else o.id end
      into v_candidate, v_canonical
      from public.operations o
      left join private.operation_identity_shadow_runs r
        on r.operation_id=o.id and r.identity_version=1
      where o.id<>v_op.id
        and o.created_at<=v_op.created_at
        and o.transaction_fingerprint=v_fingerprint
      order by o.created_at,o.id
      limit 1;

      if v_candidate is not null then
        v_match_type := 'exact_duplicate';
        v_confidence := 0.995;
        v_evidence := jsonb_build_object(
          'strategy','semantic_fingerprint',
          'same_entity_reference',true,
          'same_destination',true,
          'same_amount_currency',true,
          'shadow_mode',true
        );
      end if;
    end if;

    if v_match_type is null then
      select o.id,
             case when r.match_type='exact_duplicate' and r.canonical_operation_id is not null
                  then r.canonical_operation_id else o.id end
      into v_candidate, v_canonical
      from public.operations o
      left join private.operation_identity_shadow_runs r
        on r.operation_id=o.id and r.identity_version=1
      where o.id<>v_op.id
        and o.created_at<=v_op.created_at
        and o.transaction_identity_key=v_identity_key
        and o.amount is not distinct from v_op.amount
        and upper(coalesce(o.currency,''))=coalesce(v_currency,'')
      order by o.created_at,o.id
      limit 1;

      if v_candidate is not null then
        v_match_type := 'probable_duplicate';
        v_confidence := 0.90;
        v_evidence := jsonb_build_object(
          'strategy','entity_reference_amount_currency',
          'same_entity_reference',true,
          'same_amount_currency',true,
          'destination_not_required',true,
          'shadow_mode',true
        );
      else
        v_match_type := 'unique_candidate';
        v_confidence := 0.80;
        v_evidence := jsonb_build_object(
          'strategy','no_prior_identity_match',
          'same_entity_reference',false,
          'shadow_mode',true
        );
      end if;
    end if;
  end if;

  if v_canonical is null and v_candidate is not null then
    v_canonical := v_candidate;
  end if;

  update public.operations
  set identity_version=1,
      normalized_reference_number=v_ref,
      transaction_identity_key=v_identity_key,
      transaction_fingerprint=v_fingerprint,
      identity_status=v_match_type,
      identity_confidence=v_confidence,
      identity_evidence=v_evidence,
      identity_evaluated_at=now()
  where id=v_op.id;

  insert into private.operation_identity_shadow_runs(
    operation_id,identity_version,entity_code,normalized_reference_number,destination_identifier,
    transaction_identity_key,transaction_fingerprint,match_type,candidate_operation_id,
    canonical_operation_id,confidence,evidence,evaluated_at
  ) values (
    v_op.id,1,v_entity,v_ref,v_destination,v_identity_key,v_fingerprint,v_match_type,
    v_candidate,v_canonical,v_confidence,v_evidence,now()
  )
  on conflict (operation_id,identity_version) do update
  set entity_code=excluded.entity_code,
      normalized_reference_number=excluded.normalized_reference_number,
      destination_identifier=excluded.destination_identifier,
      transaction_identity_key=excluded.transaction_identity_key,
      transaction_fingerprint=excluded.transaction_fingerprint,
      match_type=excluded.match_type,
      candidate_operation_id=excluded.candidate_operation_id,
      canonical_operation_id=excluded.canonical_operation_id,
      confidence=excluded.confidence,
      evidence=excluded.evidence,
      evaluated_at=excluded.evaluated_at;

  update private.operation_submissions
  set canonical_operation_id=coalesce(v_canonical,v_op.id),
      identity_version=1,
      identity_match_type=v_match_type,
      matched_operation_id=v_candidate,
      metadata=metadata || jsonb_build_object(
        'transaction_identity_key',v_identity_key,
        'transaction_fingerprint',v_fingerprint,
        'shadow_mode',true
      ),
      updated_at=now()
  where submitted_operation_id=v_op.id;

  return jsonb_build_object(
    'ok',true,
    'operation_id',v_op.id,
    'match_type',v_match_type,
    'candidate_operation_id',v_candidate,
    'canonical_operation_id',coalesce(v_canonical,v_op.id),
    'confidence',v_confidence,
    'shadow_mode',true
  );
end;
$$;

revoke all on function private.evaluate_operation_identity_shadow(uuid) from public, anon, authenticated;
revoke all on function private.sanad_identity_normalize_digits(text) from public, anon, authenticated;
revoke all on function private.sanad_identity_normalize_reference(text) from public, anon, authenticated;
revoke all on function private.sanad_identity_normalize_identifier(text) from public, anon, authenticated;
revoke all on function private.sanad_identity_entity_code(text,text) from public, anon, authenticated;

create or replace function private.capture_operation_submission_shadow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message_id text;
begin
  v_message_id := coalesce(new.storage_metadata->>'meta_message_id', new.client_upload_metadata->>'message_id');

  insert into private.operation_submissions(
    submitted_operation_id,canonical_operation_id,source,source_message_id,
    submitted_by_user_id,submitted_by_phone,file_sha256,identity_match_type,metadata
  ) values (
    new.id,new.id,coalesce(new.source,'unknown'),v_message_id,
    new.submitted_by_user_id,new.submitted_by_phone,new.file_sha256,'pending',
    jsonb_build_object('shadow_mode',true,'pipeline_run_id',new.pipeline_run_id)
  )
  on conflict (submitted_operation_id) do nothing;

  if new.ai_status='completed' then
    perform private.evaluate_operation_identity_shadow(new.id);
  end if;
  return new;
end;
$$;

create or replace function private.refresh_operation_identity_shadow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.ai_status='completed' then
    perform private.evaluate_operation_identity_shadow(new.id);
  elsif new.ai_status is distinct from old.ai_status then
    update public.operations
    set identity_status='pending',identity_evaluated_at=null
    where id=new.id;
  end if;
  return new;
end;
$$;

revoke all on function private.capture_operation_submission_shadow() from public, anon, authenticated;
revoke all on function private.refresh_operation_identity_shadow() from public, anon, authenticated;

drop trigger if exists operations_identity_submission_shadow_insert on public.operations;
create trigger operations_identity_submission_shadow_insert
after insert on public.operations
for each row execute function private.capture_operation_submission_shadow();

drop trigger if exists operations_identity_shadow_refresh on public.operations;
create trigger operations_identity_shadow_refresh
after update of ai_status, financial_entity, financial_entity_code, reference_number,
  merchant_point, merchant_point_normalized, receiver_account, receiver_account_normalized,
  amount, currency, file_sha256
on public.operations
for each row
when (
  old.ai_status is distinct from new.ai_status
  or old.financial_entity is distinct from new.financial_entity
  or old.financial_entity_code is distinct from new.financial_entity_code
  or old.reference_number is distinct from new.reference_number
  or old.merchant_point is distinct from new.merchant_point
  or old.merchant_point_normalized is distinct from new.merchant_point_normalized
  or old.receiver_account is distinct from new.receiver_account
  or old.receiver_account_normalized is distinct from new.receiver_account_normalized
  or old.amount is distinct from new.amount
  or old.currency is distinct from new.currency
  or old.file_sha256 is distinct from new.file_sha256
)
execute function private.refresh_operation_identity_shadow();

-- Historical occurrence ledger: one submission per already-created operation.
insert into private.operation_submissions(
  submitted_operation_id,canonical_operation_id,source,source_message_id,
  submitted_by_user_id,submitted_by_phone,file_sha256,identity_match_type,metadata,created_at,updated_at
)
select o.id,o.id,coalesce(o.source,'unknown'),
       coalesce(o.storage_metadata->>'meta_message_id',o.client_upload_metadata->>'message_id'),
       o.submitted_by_user_id,o.submitted_by_phone,o.file_sha256,'pending',
       jsonb_build_object('shadow_mode',true,'historical_backfill',true,'pipeline_run_id',o.pipeline_run_id),
       o.created_at,now()
from public.operations o
on conflict (submitted_operation_id) do nothing;

-- Historical Shadow backfill oldest-first so canonical candidates are deterministic.
do $$
declare
  v_id uuid;
begin
  for v_id in
    select id from public.operations
    where ai_status='completed'
    order by created_at,id
  loop
    perform private.evaluate_operation_identity_shadow(v_id);
  end loop;
end;
$$;

comment on column public.operations.transaction_identity_key is
  'Shadow v1 broad candidate key: canonical financial entity + normalized reference. Not a uniqueness constraint.';
comment on column public.operations.transaction_fingerprint is
  'Shadow v1 SHA-256 semantic fingerprint using entity, reference, destination, amount and currency when available.';
comment on column public.operations.identity_status is
  'Shadow v1 deterministic reuse classification. Does not change routing, UI, billing or operation creation.';
comment on table private.operation_identity_shadow_runs is
  'Internal audit ledger for deterministic transaction identity/reuse detection v1.';
comment on table private.operation_submissions is
  'Internal submission/occurrence ledger. In Shadow v1 every existing operation has one submission; enforcement may later map multiple submissions to one canonical operation.';
