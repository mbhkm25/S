begin;

alter table public.sanad_assistant_settings
  add column if not exists fast_path_enabled boolean not null default true,
  add column if not exists max_grounding_units integer not null default 5,
  add column if not exists response_style_version text not null default 'sanad-whatsapp-professional-v1',
  add column if not exists website_sync_enabled boolean not null default true;

alter table public.sanad_assistant_settings
  drop constraint if exists sanad_assistant_settings_max_grounding_units_check;
alter table public.sanad_assistant_settings
  add constraint sanad_assistant_settings_max_grounding_units_check
  check (max_grounding_units between 3 and 8);

update public.sanad_assistant_settings
set prompt_version = 'sanad-assistant-v5',
    temperature = least(temperature, 0.30),
    recent_messages_limit = least(recent_messages_limit, 16),
    search_results_limit = least(search_results_limit, 6),
    updated_at = now()
where singleton = true;

create table if not exists public.sanad_website_sync_runs (
  id uuid primary key default gen_random_uuid(),
  root_url text not null,
  sitemap_url text,
  status text not null default 'running' check (status in ('running','completed','partial','failed')),
  discovered_count integer not null default 0,
  processed_count integer not null default 0,
  changed_count integer not null default 0,
  failed_count integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_summary text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.sanad_website_pages (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.sanad_knowledge_sources(id) on delete set null,
  canonical_url text not null unique,
  title text,
  content_hash text not null,
  http_status integer,
  last_modified_at timestamptz,
  last_fetched_at timestamptz not null default now(),
  last_changed_at timestamptz not null default now(),
  sync_status text not null default 'synced' check (sync_status in ('synced','unchanged','failed','excluded')),
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sanad_website_sync_runs enable row level security;
alter table public.sanad_website_pages enable row level security;

revoke all on public.sanad_website_sync_runs from anon, authenticated;
revoke all on public.sanad_website_pages from anon, authenticated;
grant all on public.sanad_website_sync_runs to service_role;
grant all on public.sanad_website_pages to service_role;

create index if not exists sanad_website_pages_source_idx on public.sanad_website_pages(source_id);
create index if not exists sanad_website_pages_status_idx on public.sanad_website_pages(sync_status,last_fetched_at desc);

create or replace function public.sync_sanad_website_knowledge_page(
  p_canonical_url text,
  p_title text,
  p_description text,
  p_units jsonb,
  p_content_hash text,
  p_last_modified_at timestamptz default null,
  p_publish boolean default false,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text := lower(regexp_replace(trim(coalesce(p_canonical_url,'')), '[?#].*$', '', 'g'));
  v_source_id uuid;
  v_source_code text;
  v_existing_hash text;
  v_changed boolean := true;
  v_unit jsonb;
  v_index integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;
  if v_url = '' or v_url !~ '^https://(www\.)?sanadflow\.com(/|$)' then
    raise exception 'invalid_sanad_website_url';
  end if;
  if nullif(trim(coalesce(p_content_hash,'')),'') is null then
    raise exception 'content_hash_required';
  end if;
  if jsonb_typeof(coalesce(p_units,'[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_units,'[]'::jsonb)) = 0 then
    raise exception 'knowledge_units_required';
  end if;

  select wp.source_id, wp.content_hash
  into v_source_id, v_existing_hash
  from public.sanad_website_pages wp
  where wp.canonical_url = v_url
  for update;

  v_changed := v_existing_hash is distinct from p_content_hash;
  v_source_code := 'WEB-' || upper(substr(md5(v_url),1,12));

  if v_source_id is null then
    insert into public.sanad_knowledge_sources(
      source_code,source_type,title,description,knowledge_scope,status,visibility,
      authority_level,language,effective_from,approved_at,published_at,metadata
    ) values (
      v_source_code,'website_page',left(coalesce(nullif(trim(p_title),''),v_url),240),
      nullif(left(trim(coalesce(p_description,'')),1200),''),'official_website',
      case when p_publish then 'published' else 'draft' end,'assistant_public',3,'ar',now(),
      case when p_publish then now() else null end,
      case when p_publish then now() else null end,
      coalesce(p_metadata,'{}'::jsonb) || jsonb_build_object('managed_by','sanad-website-sync','canonical_url',v_url)
    ) returning id into v_source_id;
  elsif v_changed then
    update public.sanad_knowledge_sources
    set title = left(coalesce(nullif(trim(p_title),''),title),240),
        description = nullif(left(trim(coalesce(p_description,'')),1200),''),
        version_number = version_number + 1,
        status = case when p_publish then 'published' else 'draft' end,
        approved_at = case when p_publish then now() else null end,
        published_at = case when p_publish then now() else null end,
        metadata = metadata || coalesce(p_metadata,'{}'::jsonb) || jsonb_build_object('managed_by','sanad-website-sync','canonical_url',v_url),
        updated_at = now()
    where id = v_source_id;
  end if;

  insert into public.sanad_website_pages(
    source_id,canonical_url,title,content_hash,last_modified_at,last_fetched_at,last_changed_at,sync_status,metadata
  ) values (
    v_source_id,v_url,left(coalesce(p_title,''),240),p_content_hash,p_last_modified_at,now(),now(),'synced',coalesce(p_metadata,'{}'::jsonb)
  )
  on conflict (canonical_url) do update set
    source_id = excluded.source_id,
    title = excluded.title,
    content_hash = excluded.content_hash,
    last_modified_at = excluded.last_modified_at,
    last_fetched_at = now(),
    last_changed_at = case when public.sanad_website_pages.content_hash is distinct from excluded.content_hash then now() else public.sanad_website_pages.last_changed_at end,
    sync_status = case when public.sanad_website_pages.content_hash is distinct from excluded.content_hash then 'synced' else 'unchanged' end,
    last_error = null,
    metadata = public.sanad_website_pages.metadata || excluded.metadata,
    updated_at = now();

  if v_changed then
    update public.sanad_knowledge_units set status='inactive', updated_at=now() where source_id=v_source_id and status='active';
    for v_unit in select value from jsonb_array_elements(p_units)
    loop
      insert into public.sanad_knowledge_units(
        source_id,unit_type,heading,content,summary,keywords,intent_tags,audience_tags,channel_tags,chunk_index,status,metadata
      ) values (
        v_source_id,
        coalesce(nullif(v_unit->>'unit_type',''),'website_section'),
        nullif(left(trim(coalesce(v_unit->>'heading','')),300),''),
        left(trim(coalesce(v_unit->>'content','')),12000),
        nullif(left(trim(coalesce(v_unit->>'summary','')),1200),''),
        coalesce(array(select jsonb_array_elements_text(coalesce(v_unit->'keywords','[]'::jsonb))),array[]::text[]),
        coalesce(array(select jsonb_array_elements_text(coalesce(v_unit->'intent_tags','[]'::jsonb))),array['knowledge_inquiry']::text[]),
        coalesce(array(select jsonb_array_elements_text(coalesce(v_unit->'audience_tags','[]'::jsonb))),array['new_user','customer']::text[]),
        coalesce(array(select jsonb_array_elements_text(coalesce(v_unit->'channel_tags','[]'::jsonb))),array['whatsapp','website']::text[]),
        v_index,'active',coalesce(v_unit->'metadata','{}'::jsonb)
      );
      v_index := v_index + 1;
    end loop;
  end if;

  insert into public.sanad_knowledge_references(source_id,platform,reference_type,external_url,normalized_url,label,is_primary,metadata)
  values(v_source_id,'sanadflow.com','official_page',v_url,v_url,'صفحة سند الرسمية',true,jsonb_build_object('managed_by','sanad-website-sync'))
  on conflict do nothing;

  return jsonb_build_object('ok',true,'source_id',v_source_id,'source_code',v_source_code,'changed',v_changed,'status',case when p_publish then 'published' else 'draft' end);
end;
$$;

revoke all on function public.sync_sanad_website_knowledge_page(text,text,text,jsonb,text,timestamptz,boolean,jsonb) from public, anon, authenticated;
grant execute on function public.sync_sanad_website_knowledge_page(text,text,text,jsonb,text,timestamptz,boolean,jsonb) to service_role;

commit;
