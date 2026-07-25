-- SANAD Knowledge Management System foundation.
-- Applied to production project hudbzlgclghlhazlduas on 2026-07-25.

begin;

create table public.sanad_knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  source_code text not null unique,
  source_type text not null check (source_type in (
    'document','digital_content','faq','official_information','service_procedure',
    'policy','website_page','campaign','product_guide','dynamic_data','manual_entry'
  )),
  title text not null check (length(trim(title)) between 2 and 240),
  description text,
  knowledge_scope text not null default 'platform_official' check (knowledge_scope in (
    'platform_official','customer_service','financial_operations','subscription',
    'business','digital_marketing','technical_support','internal_operations'
  )),
  status text not null default 'draft' check (status in (
    'draft','in_review','approved','published','superseded','archived','expired'
  )),
  visibility text not null default 'assistant_public' check (visibility in (
    'assistant_public','assistant_authenticated','internal_only'
  )),
  authority_level smallint not null default 3 check (authority_level between 1 and 5),
  language text not null default 'ar',
  version_number integer not null default 1 check (version_number > 0),
  supersedes_source_id uuid references public.sanad_knowledge_sources(id) on delete set null,
  effective_from timestamptz,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_by_user_id uuid references public.profiles(id) on delete set null,
  updated_by_user_id uuid references public.profiles(id) on delete set null,
  approved_by_user_id uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or effective_from is null or expires_at > effective_from)
);

create index sanad_knowledge_sources_status_scope_idx
  on public.sanad_knowledge_sources(status, knowledge_scope, authority_level);
create index sanad_knowledge_sources_type_updated_idx
  on public.sanad_knowledge_sources(source_type, updated_at desc);

create table public.sanad_knowledge_source_versions (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sanad_knowledge_sources(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  title text not null,
  description text,
  content_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(content_snapshot) = 'object'),
  change_summary text,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (source_id, version_number)
);

create table public.sanad_knowledge_units (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sanad_knowledge_sources(id) on delete cascade,
  unit_type text not null default 'section' check (unit_type in (
    'document_section','social_post','faq_answer','procedure_step','policy_clause',
    'official_fact','campaign_message','section','summary'
  )),
  heading text,
  content text not null check (length(trim(content)) > 0),
  summary text,
  keywords text[] not null default '{}',
  intent_tags text[] not null default '{}',
  audience_tags text[] not null default '{}',
  channel_tags text[] not null default '{}',
  chunk_index integer not null default 0 check (chunk_index >= 0),
  token_count integer,
  status text not null default 'active' check (status in ('active','disabled','superseded')),
  effective_from timestamptz,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  search_vector tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, chunk_index)
);

create index sanad_knowledge_units_source_status_idx
  on public.sanad_knowledge_units(source_id, status, chunk_index);
create index sanad_knowledge_units_search_idx
  on public.sanad_knowledge_units using gin(search_vector);
create index sanad_knowledge_units_intent_tags_idx
  on public.sanad_knowledge_units using gin(intent_tags);

create table public.sanad_knowledge_references (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sanad_knowledge_sources(id) on delete cascade,
  platform text not null,
  reference_type text not null default 'external_url' check (reference_type in (
    'external_url','platform_post','canonical_url','campaign_code','document_file','website_page'
  )),
  external_url text,
  normalized_url text,
  external_id text,
  label text,
  is_primary boolean not null default false,
  published_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create unique index sanad_knowledge_references_normalized_url_uidx
  on public.sanad_knowledge_references(normalized_url)
  where normalized_url is not null;
create index sanad_knowledge_references_external_id_idx
  on public.sanad_knowledge_references(platform, external_id)
  where external_id is not null;

create table public.sanad_digital_content (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null unique references public.sanad_knowledge_sources(id) on delete cascade,
  platform text not null check (platform in ('facebook','instagram','whatsapp','youtube','tiktok','website','other')),
  content_type text not null check (content_type in ('post','reel','story','video','image','article','campaign','announcement')),
  body_text text,
  assistant_context text,
  campaign_name text,
  campaign_objective text,
  primary_cta_type text check (primary_cta_type is null or primary_cta_type in (
    'install_app','open_whatsapp','subscribe','visit_url','contact_support','learn_more','none'
  )),
  primary_cta_label text,
  primary_cta_url text,
  whatsapp_prefill_text text,
  media jsonb not null default '[]'::jsonb check (jsonb_typeof(media) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sanad_digital_content_platform_idx
  on public.sanad_digital_content(platform, updated_at desc);

create table public.sanad_knowledge_retrieval_logs (
  id bigint generated always as identity primary key,
  assistant_message_id uuid,
  conversation_id uuid,
  query_text text,
  detected_intent text,
  matched_source_ids uuid[] not null default '{}',
  matched_unit_ids uuid[] not null default '{}',
  match_method text,
  scores jsonb not null default '[]'::jsonb,
  response_source_ids uuid[] not null default '{}',
  confidence numeric(5,4),
  fallback_used boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index sanad_knowledge_retrieval_logs_created_idx
  on public.sanad_knowledge_retrieval_logs(created_at desc);

create table public.sanad_knowledge_test_cases (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  input_text text not null,
  expected_intent text,
  expected_source_codes text[] not null default '{}',
  expected_answer_contains text[] not null default '{}',
  status text not null default 'active' check (status in ('active','disabled')),
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_sanad_knowledge_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.set_sanad_knowledge_unit_search_vector()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.search_vector :=
    setweight(to_tsvector('simple', coalesce(new.heading, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(new.summary, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(new.content, '')), 'C') ||
    setweight(to_tsvector('simple', array_to_string(new.keywords, ' ')), 'B');
  return new;
end;
$$;

revoke all on function public.set_sanad_knowledge_updated_at() from public, anon, authenticated;
revoke all on function public.set_sanad_knowledge_unit_search_vector() from public, anon, authenticated;

create trigger sanad_knowledge_sources_updated_at
before update on public.sanad_knowledge_sources
for each row execute function public.set_sanad_knowledge_updated_at();
create trigger sanad_knowledge_units_updated_at
before update on public.sanad_knowledge_units
for each row execute function public.set_sanad_knowledge_updated_at();
create trigger sanad_knowledge_units_search_vector
before insert or update of heading, summary, content, keywords on public.sanad_knowledge_units
for each row execute function public.set_sanad_knowledge_unit_search_vector();
create trigger sanad_digital_content_updated_at
before update on public.sanad_digital_content
for each row execute function public.set_sanad_knowledge_updated_at();
create trigger sanad_knowledge_test_cases_updated_at
before update on public.sanad_knowledge_test_cases
for each row execute function public.set_sanad_knowledge_updated_at();

alter table public.sanad_knowledge_sources enable row level security;
alter table public.sanad_knowledge_source_versions enable row level security;
alter table public.sanad_knowledge_units enable row level security;
alter table public.sanad_knowledge_references enable row level security;
alter table public.sanad_digital_content enable row level security;
alter table public.sanad_knowledge_retrieval_logs enable row level security;
alter table public.sanad_knowledge_test_cases enable row level security;

revoke all on table
  public.sanad_knowledge_sources,
  public.sanad_knowledge_source_versions,
  public.sanad_knowledge_units,
  public.sanad_knowledge_references,
  public.sanad_digital_content,
  public.sanad_knowledge_retrieval_logs,
  public.sanad_knowledge_test_cases
from anon, authenticated;

grant all on table
  public.sanad_knowledge_sources,
  public.sanad_knowledge_source_versions,
  public.sanad_knowledge_units,
  public.sanad_knowledge_references,
  public.sanad_digital_content,
  public.sanad_knowledge_retrieval_logs,
  public.sanad_knowledge_test_cases
to service_role;

create or replace function public.platform_admin_get_knowledge_overview(
  p_limit integer default 100,
  p_search text default null,
  p_source_type text default null,
  p_status text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 250));
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_items jsonb;
begin
  if not public.is_current_platform_admin() then
    raise exception 'platform_admin_required';
  end if;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.updated_at desc), '[]'::jsonb)
  into v_items
  from (
    select
      s.id, s.source_code, s.source_type, s.title, s.description,
      s.knowledge_scope, s.status, s.visibility, s.authority_level,
      s.language, s.version_number, s.effective_from, s.expires_at,
      s.approved_at, s.published_at, s.created_at, s.updated_at,
      count(distinct u.id)::integer as units_count,
      count(distinct r.id)::integer as references_count,
      dc.platform as digital_platform,
      dc.content_type,
      dc.primary_cta_type,
      dc.primary_cta_url
    from public.sanad_knowledge_sources s
    left join public.sanad_knowledge_units u on u.source_id = s.id
    left join public.sanad_knowledge_references r on r.source_id = s.id
    left join public.sanad_digital_content dc on dc.source_id = s.id
    where (p_source_type is null or s.source_type = p_source_type)
      and (p_status is null or s.status = p_status)
      and (
        v_search is null
        or s.title ilike '%' || v_search || '%'
        or s.source_code ilike '%' || v_search || '%'
        or coalesce(s.description, '') ilike '%' || v_search || '%'
      )
    group by s.id, dc.platform, dc.content_type, dc.primary_cta_type, dc.primary_cta_url
    order by s.updated_at desc
    limit v_limit
  ) q;

  return jsonb_build_object(
    'counts', jsonb_build_object(
      'total', (select count(*) from public.sanad_knowledge_sources),
      'published', (select count(*) from public.sanad_knowledge_sources where status = 'published'),
      'draft', (select count(*) from public.sanad_knowledge_sources where status = 'draft'),
      'needs_review', (select count(*) from public.sanad_knowledge_sources where status = 'in_review'),
      'expiring_soon', (select count(*) from public.sanad_knowledge_sources where expires_at between now() and now() + interval '30 days'),
      'documents', (select count(*) from public.sanad_knowledge_sources where source_type = 'document'),
      'digital_content', (select count(*) from public.sanad_knowledge_sources where source_type = 'digital_content')
    ),
    'items', v_items
  );
end;
$$;

create or replace function public.platform_admin_upsert_knowledge_source(
  p_payload jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid := nullif(p_payload ->> 'id', '')::uuid;
  v_source public.sanad_knowledge_sources%rowtype;
  v_before jsonb;
  v_code text;
  v_units jsonb := coalesce(p_payload -> 'units', '[]'::jsonb);
  v_refs jsonb := coalesce(p_payload -> 'references', '[]'::jsonb);
  v_digital jsonb := p_payload -> 'digital_content';
begin
  if not public.is_current_platform_admin() then raise exception 'platform_admin_required'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'reason_required'; end if;
  if jsonb_typeof(v_units) <> 'array' or jsonb_typeof(v_refs) <> 'array' then raise exception 'invalid_arrays'; end if;

  v_code := upper(regexp_replace(
    coalesce(nullif(trim(p_payload ->> 'source_code'), ''), 'SK-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
    '[^A-Z0-9_-]+', '-', 'g'
  ));

  if v_id is null then
    insert into public.sanad_knowledge_sources(
      source_code, source_type, title, description, knowledge_scope, status,
      visibility, authority_level, language, effective_from, expires_at,
      metadata, created_by_user_id, updated_by_user_id
    ) values (
      v_code,
      coalesce(p_payload ->> 'source_type', 'manual_entry'),
      trim(p_payload ->> 'title'),
      nullif(trim(p_payload ->> 'description'), ''),
      coalesce(p_payload ->> 'knowledge_scope', 'platform_official'),
      coalesce(p_payload ->> 'status', 'draft'),
      coalesce(p_payload ->> 'visibility', 'assistant_public'),
      coalesce((p_payload ->> 'authority_level')::smallint, 3),
      coalesce(p_payload ->> 'language', 'ar'),
      nullif(p_payload ->> 'effective_from', '')::timestamptz,
      nullif(p_payload ->> 'expires_at', '')::timestamptz,
      coalesce(p_payload -> 'metadata', '{}'::jsonb),
      v_actor, v_actor
    ) returning * into v_source;
  else
    select to_jsonb(s) into v_before
    from public.sanad_knowledge_sources s
    where s.id = v_id
    for update;

    if v_before is null then raise exception 'knowledge_source_not_found'; end if;

    update public.sanad_knowledge_sources
    set source_code = v_code,
        source_type = coalesce(p_payload ->> 'source_type', source_type),
        title = trim(coalesce(p_payload ->> 'title', title)),
        description = case when p_payload ? 'description' then nullif(trim(p_payload ->> 'description'), '') else description end,
        knowledge_scope = coalesce(p_payload ->> 'knowledge_scope', knowledge_scope),
        status = coalesce(p_payload ->> 'status', status),
        visibility = coalesce(p_payload ->> 'visibility', visibility),
        authority_level = coalesce((p_payload ->> 'authority_level')::smallint, authority_level),
        language = coalesce(p_payload ->> 'language', language),
        effective_from = case when p_payload ? 'effective_from' then nullif(p_payload ->> 'effective_from', '')::timestamptz else effective_from end,
        expires_at = case when p_payload ? 'expires_at' then nullif(p_payload ->> 'expires_at', '')::timestamptz else expires_at end,
        metadata = case when p_payload ? 'metadata' then coalesce(p_payload -> 'metadata', '{}'::jsonb) else metadata end,
        updated_by_user_id = v_actor
    where id = v_id
    returning * into v_source;
  end if;

  if p_payload ? 'units' then
    delete from public.sanad_knowledge_units where source_id = v_source.id;
    insert into public.sanad_knowledge_units(
      source_id, unit_type, heading, content, summary, keywords,
      intent_tags, audience_tags, channel_tags, chunk_index, metadata
    )
    select
      v_source.id,
      coalesce(x ->> 'unit_type', 'section'),
      nullif(trim(x ->> 'heading'), ''),
      trim(x ->> 'content'),
      nullif(trim(x ->> 'summary'), ''),
      coalesce(array(select jsonb_array_elements_text(coalesce(x -> 'keywords', '[]'::jsonb))), '{}'),
      coalesce(array(select jsonb_array_elements_text(coalesce(x -> 'intent_tags', '[]'::jsonb))), '{}'),
      coalesce(array(select jsonb_array_elements_text(coalesce(x -> 'audience_tags', '[]'::jsonb))), '{}'),
      coalesce(array(select jsonb_array_elements_text(coalesce(x -> 'channel_tags', '[]'::jsonb))), '{}'),
      row_number() over () - 1,
      coalesce(x -> 'metadata', '{}'::jsonb)
    from jsonb_array_elements(v_units) x
    where length(trim(coalesce(x ->> 'content', ''))) > 0;
  end if;

  if p_payload ? 'references' then
    delete from public.sanad_knowledge_references where source_id = v_source.id;
    insert into public.sanad_knowledge_references(
      source_id, platform, reference_type, external_url, normalized_url,
      external_id, label, is_primary, published_at, metadata
    )
    select
      v_source.id,
      coalesce(x ->> 'platform', 'other'),
      coalesce(x ->> 'reference_type', 'external_url'),
      nullif(trim(x ->> 'external_url'), ''),
      nullif(lower(regexp_replace(trim(x ->> 'external_url'), '[?#].*$', '', 'g')), ''),
      nullif(trim(x ->> 'external_id'), ''),
      nullif(trim(x ->> 'label'), ''),
      coalesce((x ->> 'is_primary')::boolean, false),
      nullif(x ->> 'published_at', '')::timestamptz,
      coalesce(x -> 'metadata', '{}'::jsonb)
    from jsonb_array_elements(v_refs) x;
  end if;

  if v_source.source_type = 'digital_content' and v_digital is not null then
    insert into public.sanad_digital_content(
      source_id, platform, content_type, body_text, assistant_context,
      campaign_name, campaign_objective, primary_cta_type, primary_cta_label,
      primary_cta_url, whatsapp_prefill_text, media
    ) values (
      v_source.id,
      coalesce(v_digital ->> 'platform', 'other'),
      coalesce(v_digital ->> 'content_type', 'post'),
      nullif(trim(v_digital ->> 'body_text'), ''),
      nullif(trim(v_digital ->> 'assistant_context'), ''),
      nullif(trim(v_digital ->> 'campaign_name'), ''),
      nullif(trim(v_digital ->> 'campaign_objective'), ''),
      nullif(v_digital ->> 'primary_cta_type', ''),
      nullif(trim(v_digital ->> 'primary_cta_label'), ''),
      nullif(trim(v_digital ->> 'primary_cta_url'), ''),
      nullif(trim(v_digital ->> 'whatsapp_prefill_text'), ''),
      coalesce(v_digital -> 'media', '[]'::jsonb)
    )
    on conflict (source_id) do update
    set platform = excluded.platform,
        content_type = excluded.content_type,
        body_text = excluded.body_text,
        assistant_context = excluded.assistant_context,
        campaign_name = excluded.campaign_name,
        campaign_objective = excluded.campaign_objective,
        primary_cta_type = excluded.primary_cta_type,
        primary_cta_label = excluded.primary_cta_label,
        primary_cta_url = excluded.primary_cta_url,
        whatsapp_prefill_text = excluded.whatsapp_prefill_text,
        media = excluded.media;
  end if;

  insert into public.sanad_knowledge_source_versions(
    source_id, version_number, title, description, content_snapshot,
    change_summary, created_by_user_id
  ) values (
    v_source.id, v_source.version_number, v_source.title, v_source.description,
    jsonb_build_object('source', to_jsonb(v_source), 'units', v_units, 'references', v_refs, 'digital_content', v_digital),
    p_reason, v_actor
  )
  on conflict (source_id, version_number) do update
  set content_snapshot = excluded.content_snapshot,
      change_summary = excluded.change_summary,
      created_by_user_id = excluded.created_by_user_id,
      created_at = now();

  insert into public.platform_admin_audit_log(
    actor_user_id, action, target_type, target_id, reason, before_data, after_data
  ) values (
    v_actor,
    case when v_id is null then 'knowledge_source_created' else 'knowledge_source_updated' end,
    'sanad_knowledge_source', v_source.id::text, p_reason, v_before, to_jsonb(v_source)
  );

  return jsonb_build_object(
    'ok', true,
    'source_id', v_source.id,
    'source_code', v_source.source_code,
    'status', v_source.status
  );
end;
$$;

create or replace function public.platform_admin_set_knowledge_status(
  p_source_id uuid,
  p_status text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_before jsonb;
  v_after jsonb;
begin
  if not public.is_current_platform_admin() then raise exception 'platform_admin_required'; end if;
  if p_status not in ('draft','in_review','approved','published','superseded','archived','expired') then raise exception 'invalid_status'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'reason_required'; end if;

  select to_jsonb(s) into v_before
  from public.sanad_knowledge_sources s
  where id = p_source_id
  for update;

  if v_before is null then raise exception 'knowledge_source_not_found'; end if;

  update public.sanad_knowledge_sources
  set status = p_status,
      updated_by_user_id = v_actor,
      approved_by_user_id = case when p_status in ('approved','published') then v_actor else approved_by_user_id end,
      approved_at = case when p_status in ('approved','published') then coalesce(approved_at, now()) else approved_at end,
      published_at = case when p_status = 'published' then coalesce(published_at, now()) else published_at end
  where id = p_source_id
  returning to_jsonb(sanad_knowledge_sources.*) into v_after;

  insert into public.platform_admin_audit_log(
    actor_user_id, action, target_type, target_id, reason, before_data, after_data
  ) values (
    v_actor, 'knowledge_status_changed', 'sanad_knowledge_source',
    p_source_id::text, p_reason, v_before, v_after
  );

  return jsonb_build_object('ok', true, 'source', v_after);
end;
$$;

create or replace function public.search_sanad_knowledge(
  p_query text,
  p_intent text default null,
  p_scope text default null,
  p_audience text default null,
  p_channel text default 'whatsapp',
  p_reference_url text default null,
  p_source_code text default null,
  p_limit integer default 6
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query text := nullif(trim(coalesce(p_query, '')), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 6), 12));
  v_url text := nullif(lower(regexp_replace(trim(coalesce(p_reference_url, '')), '[?#].*$', '', 'g')), '');
  v_results jsonb;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.score desc, r.authority_level asc, r.updated_at desc), '[]'::jsonb)
  into v_results
  from (
    select
      s.id as source_id,
      s.source_code,
      s.source_type,
      s.title,
      s.description,
      s.knowledge_scope,
      s.authority_level,
      s.visibility,
      s.updated_at,
      u.id as unit_id,
      u.heading,
      u.content,
      u.summary,
      u.intent_tags,
      u.audience_tags,
      u.channel_tags,
      dc.platform,
      dc.content_type,
      dc.primary_cta_type,
      dc.primary_cta_label,
      dc.primary_cta_url,
      dc.assistant_context,
      greatest(
        case when p_source_code is not null and upper(s.source_code) = upper(p_source_code) then 1000 else 0 end,
        case when v_url is not null and exists (
          select 1 from public.sanad_knowledge_references kr
          where kr.source_id = s.id and kr.normalized_url = v_url
        ) then 950 else 0 end,
        case when v_query is not null then ts_rank_cd(u.search_vector, websearch_to_tsquery('simple', v_query)) * 100 else 0 end
          + case when p_intent is not null and p_intent = any(u.intent_tags) then 60 else 0 end
          + case when p_audience is not null and p_audience = any(u.audience_tags) then 25 else 0 end
          + case when p_channel is not null and p_channel = any(u.channel_tags) then 15 else 0 end
          + (6 - s.authority_level) * 8
      ) as score
    from public.sanad_knowledge_sources s
    join public.sanad_knowledge_units u on u.source_id = s.id and u.status = 'active'
    left join public.sanad_digital_content dc on dc.source_id = s.id
    where s.status = 'published'
      and s.visibility in ('assistant_public','assistant_authenticated')
      and (s.effective_from is null or s.effective_from <= now())
      and (s.expires_at is null or s.expires_at > now())
      and (u.effective_from is null or u.effective_from <= now())
      and (u.expires_at is null or u.expires_at > now())
      and (p_scope is null or s.knowledge_scope = p_scope)
      and (
        (p_source_code is not null and upper(s.source_code) = upper(p_source_code))
        or (v_url is not null and exists (
          select 1 from public.sanad_knowledge_references kr
          where kr.source_id = s.id and kr.normalized_url = v_url
        ))
        or (v_query is not null and (
          u.search_vector @@ websearch_to_tsquery('simple', v_query)
          or u.content ilike '%' || v_query || '%'
          or coalesce(u.heading, '') ilike '%' || v_query || '%'
        ))
        or (p_intent is not null and p_intent = any(u.intent_tags))
      )
    order by score desc, s.authority_level asc, s.updated_at desc
    limit v_limit
  ) r;

  return jsonb_build_object(
    'items', v_results,
    'query', v_query,
    'reference_url', v_url,
    'generated_at', now()
  );
end;
$$;

revoke all on function public.platform_admin_get_knowledge_overview(integer, text, text, text) from public, anon;
revoke all on function public.platform_admin_upsert_knowledge_source(jsonb, text) from public, anon;
revoke all on function public.platform_admin_set_knowledge_status(uuid, text, text) from public, anon;
revoke all on function public.search_sanad_knowledge(text, text, text, text, text, text, text, integer) from public, anon, authenticated;

grant execute on function public.platform_admin_get_knowledge_overview(integer, text, text, text) to authenticated, service_role;
grant execute on function public.platform_admin_upsert_knowledge_source(jsonb, text) to authenticated, service_role;
grant execute on function public.platform_admin_set_knowledge_status(uuid, text, text) to authenticated, service_role;
grant execute on function public.search_sanad_knowledge(text, text, text, text, text, text, text, integer) to service_role;

notify pgrst, 'reload schema';

commit;
