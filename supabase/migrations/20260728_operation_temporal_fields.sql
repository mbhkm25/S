begin;

alter table public.operations
  add column if not exists transaction_date date,
  add column if not exists transaction_time time without time zone,
  add column if not exists transaction_time_present boolean not null default false,
  add column if not exists transaction_date_source text,
  add column if not exists transaction_timezone text;

alter table public.operations
  drop constraint if exists operations_transaction_date_source_check;

alter table public.operations
  add constraint operations_transaction_date_source_check
  check (
    transaction_date_source is null
    or transaction_date_source in (
      'labeled_date',
      'single_detected_date',
      'explicit_datetime',
      'document_time',
      'legacy_datetime',
      'manual_correction',
      'unknown'
    )
  );

alter table public.operations
  drop constraint if exists operations_transaction_time_consistency_check;

alter table public.operations
  add constraint operations_transaction_time_consistency_check
  check (
    (transaction_time_present and transaction_time is not null)
    or (not transaction_time_present and transaction_time is null)
  );

comment on column public.operations.transaction_date is
  'Calendar date printed on the financial notice. Independent from upload and verification timestamps.';
comment on column public.operations.transaction_time is
  'Explicit time printed on the notice. NULL when the notice contains no time.';
comment on column public.operations.transaction_time_present is
  'True only when an explicit transaction time was visible in the source notice.';
comment on column public.operations.transaction_date_source is
  'How the transaction date was selected, such as labeled_date or single_detected_date.';
comment on column public.operations.transaction_timezone is
  'Timezone used only when an explicit transaction time exists; normally Asia/Aden for local notices.';

-- Conservative backfill. Prefer normalized AI metadata and never infer a time
-- merely because the legacy timestamptz contains midnight.
update public.operations o
set
  transaction_date = coalesce(
    case
      when coalesce(o.structured_data ->> 'transaction_datetime', '') ~ '^\d{4}-\d{2}-\d{2}'
        then substring(o.structured_data ->> 'transaction_datetime' from 1 for 10)::date
      when coalesce(o.raw_ai_json #>> '{normalized,transaction_datetime}', '') ~ '^\d{4}-\d{2}-\d{2}'
        then substring(o.raw_ai_json #>> '{normalized,transaction_datetime}' from 1 for 10)::date
      else null
    end,
    (o.transaction_datetime at time zone 'Asia/Aden')::date
  ),
  transaction_time_present = case
    when lower(coalesce(
      o.structured_data ->> 'transaction_time_present',
      o.raw_ai_json #>> '{normalized,transaction_time_present}',
      o.raw_ai_json #>> '{extracted,transaction_time_present}',
      'false'
    )) = 'true' then true
    else false
  end,
  transaction_time = case
    when lower(coalesce(
      o.structured_data ->> 'transaction_time_present',
      o.raw_ai_json #>> '{normalized,transaction_time_present}',
      o.raw_ai_json #>> '{extracted,transaction_time_present}',
      'false'
    )) = 'true'
      then (o.transaction_datetime at time zone 'Asia/Aden')::time
    else null
  end,
  transaction_date_source = coalesce(
    nullif(o.structured_data ->> 'transaction_date_source', ''),
    nullif(o.raw_ai_json #>> '{normalized,transaction_date_source}', ''),
    nullif(o.raw_ai_json #>> '{extracted,transaction_date_source}', ''),
    case when o.transaction_datetime is not null then 'legacy_datetime' else null end
  ),
  transaction_timezone = case
    when lower(coalesce(
      o.structured_data ->> 'transaction_time_present',
      o.raw_ai_json #>> '{normalized,transaction_time_present}',
      o.raw_ai_json #>> '{extracted,transaction_time_present}',
      'false'
    )) = 'true' then 'Asia/Aden'
    else null
  end
where o.transaction_date is null;

create index if not exists idx_operations_transaction_date_created_at
  on public.operations (transaction_date desc, created_at desc);

commit;
