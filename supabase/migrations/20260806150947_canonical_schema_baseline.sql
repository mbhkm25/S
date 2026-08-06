-- SANAD canonical schema bootstrap
-- Rebuilds the verified production schema from immutable, repository-owned Git blobs.
-- Expected canonical payload: 1,375,100 bytes / SHA-256 below.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists http with schema extensions;

do $canonical_bootstrap$
declare
  v_part_1 bytea;
  v_part_2 bytea;
  v_sql text;
  v_bytes bigint;
  v_sha256 text;
  v_response_1 extensions.http_response;
  v_response_2 extensions.http_response;
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema in ('public', 'private', 'app')
      and table_type = 'BASE TABLE'
      and not (table_schema = 'public' and table_name in ('spatial_ref_sys'))
  ) then
    raise exception 'SANAD canonical bootstrap requires a fresh database';
  end if;

  v_response_1 := extensions.http((
    'GET'::extensions.http_method,
    'https://api.github.com/repos/mbhkm25/S/git/blobs/f686e627eea987ee7ac6dd5aca2459852d7e0ef6'::varchar,
    array[
      extensions.http_header('User-Agent', 'SANAD-canonical-bootstrap'),
      extensions.http_header('Accept', 'application/vnd.github+json')
    ]::extensions.http_header[],
    null::varchar,
    null::varchar
  )::extensions.http_request);

  v_response_2 := extensions.http((
    'GET'::extensions.http_method,
    'https://api.github.com/repos/mbhkm25/S/git/blobs/375f4d82f8828ed1943d30a1d8702adeb8ad643c'::varchar,
    array[
      extensions.http_header('User-Agent', 'SANAD-canonical-bootstrap'),
      extensions.http_header('Accept', 'application/vnd.github+json')
    ]::extensions.http_header[],
    null::varchar,
    null::varchar
  )::extensions.http_request);

  if v_response_1.status <> 200 or v_response_2.status <> 200 then
    raise exception 'Canonical payload fetch failed (HTTP %, %)', v_response_1.status, v_response_2.status;
  end if;

  v_part_1 := decode(replace((v_response_1.content::jsonb)->>'content', E'\n', ''), 'base64');
  v_part_2 := decode(replace((v_response_2.content::jsonb)->>'content', E'\n', ''), 'base64');
  v_bytes := octet_length(v_part_1) + octet_length(v_part_2);
  v_sql := convert_from(v_part_1, 'UTF8') || convert_from(v_part_2, 'UTF8');
  v_sha256 := encode(extensions.digest(convert_to(v_sql, 'UTF8'), 'sha256'), 'hex');

  if v_bytes <> 1375100 then
    raise exception 'Canonical payload byte count mismatch: %', v_bytes;
  end if;

  if v_sha256 <> '8d66799f37b3177644efe9ab2a5a70e3499f26c102f59b65c674fc96c8d69dcc' then
    raise exception 'Canonical payload SHA-256 mismatch: %', v_sha256;
  end if;

  execute v_sql;
end
$canonical_bootstrap$;

-- The production reference does not retain the synchronous HTTP extension.
drop extension if exists http;
