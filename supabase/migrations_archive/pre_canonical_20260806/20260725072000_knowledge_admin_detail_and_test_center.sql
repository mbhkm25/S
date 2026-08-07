begin;

create or replace function public.platform_admin_get_knowledge_source(p_source_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_source jsonb;
  v_units jsonb;
  v_refs jsonb;
  v_digital jsonb;
  v_versions jsonb;
begin
  if not public.is_current_platform_admin() then
    raise exception 'platform_admin_required';
  end if;

  select to_jsonb(s) into v_source
  from public.sanad_knowledge_sources s
  where s.id = p_source_id;

  if v_source is null then
    raise exception 'knowledge_source_not_found';
  end if;

  select coalesce(jsonb_agg(to_jsonb(u) order by u.chunk_index), '[]'::jsonb)
  into v_units
  from public.sanad_knowledge_units u
  where u.source_id = p_source_id;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.is_primary desc, r.created_at), '[]'::jsonb)
  into v_refs
  from public.sanad_knowledge_references r
  where r.source_id = p_source_id;

  select to_jsonb(dc) into v_digital
  from public.sanad_digital_content dc
  where dc.source_id = p_source_id;

  select coalesce(jsonb_agg(to_jsonb(v) order by v.version_number desc), '[]'::jsonb)
  into v_versions
  from public.sanad_knowledge_source_versions v
  where v.source_id = p_source_id;

  return jsonb_build_object(
    'source', v_source,
    'units', v_units,
    'references', v_refs,
    'digital_content', v_digital,
    'versions', v_versions
  );
end;
$$;

create or replace function public.platform_admin_test_knowledge_search(
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
begin
  if not public.is_current_platform_admin() then
    raise exception 'platform_admin_required';
  end if;

  return public.search_sanad_knowledge(
    p_query,
    p_intent,
    p_scope,
    p_audience,
    p_channel,
    p_reference_url,
    p_source_code,
    p_limit
  );
end;
$$;

revoke all on function public.platform_admin_get_knowledge_source(uuid) from public, anon;
revoke all on function public.platform_admin_test_knowledge_search(text,text,text,text,text,text,text,integer) from public, anon;
grant execute on function public.platform_admin_get_knowledge_source(uuid) to authenticated, service_role;
grant execute on function public.platform_admin_test_knowledge_search(text,text,text,text,text,text,text,integer) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
