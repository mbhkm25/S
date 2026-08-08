-- Transaction Identity & Reuse Detection — Shadow v1 contract tests
-- These tests are deterministic and do not require fixture operations.

do $$
begin
  if private.sanad_identity_normalize_reference(' ٨-٣٤٢٠٣٨٤٥٨ ') is distinct from '8-342038458' then
    raise exception 'reference_normalization_failed';
  end if;

  if private.sanad_identity_normalize_reference(' ft261770w4bq ') is distinct from 'FT261770W4BQ' then
    raise exception 'latin_reference_uppercase_failed';
  end if;

  if private.sanad_identity_normalize_identifier(' 825-121 ') is distinct from '825121' then
    raise exception 'identifier_normalization_failed';
  end if;

  if private.sanad_identity_normalize_digits('۱۲۳٤٥') is distinct from '12345' then
    raise exception 'mixed_digit_normalization_failed';
  end if;

  if private.sanad_identity_entity_code(null, 'شركة العمقي وأخوانه للصرافة') is distinct from 'alomqy_mobile' then
    raise exception 'legacy_entity_mapping_alomqy_failed';
  end if;

  if private.sanad_identity_entity_code(null, 'الكريمي حاسب') is distinct from 'kuraimi_haseb' then
    raise exception 'legacy_entity_mapping_kuraimi_failed';
  end if;

  if private.sanad_identity_entity_code('bin_dowal_pay', 'أي اسم') is distinct from 'bin_dowal_pay' then
    raise exception 'explicit_entity_code_precedence_failed';
  end if;

  if has_table_privilege('anon', 'private.operation_identity_shadow_runs', 'select') then
    raise exception 'anon_shadow_runs_select_must_be_revoked';
  end if;

  if has_table_privilege('authenticated', 'private.operation_identity_shadow_runs', 'select') then
    raise exception 'authenticated_shadow_runs_select_must_be_revoked';
  end if;

  if has_table_privilege('anon', 'private.operation_submissions', 'select') then
    raise exception 'anon_submissions_select_must_be_revoked';
  end if;

  if has_table_privilege('authenticated', 'private.operation_submissions', 'select') then
    raise exception 'authenticated_submissions_select_must_be_revoked';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname='public'
      and tablename='operations'
      and indexname='operations_transaction_identity_key_idx'
  ) then
    raise exception 'identity_key_index_missing';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname='public'
      and tablename='operations'
      and indexname='operations_transaction_fingerprint_idx'
  ) then
    raise exception 'transaction_fingerprint_index_missing';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname='private'
      and tablename='operation_submissions'
      and indexname='operation_submissions_matched_operation_idx'
  ) then
    raise exception 'matched_operation_index_missing';
  end if;
end;
$$;

-- A reference or fingerprint must not itself be a hard uniqueness constraint in Shadow v1.
do $$
begin
  if exists (
    select 1
    from pg_index i
    join pg_class c on c.oid=i.indexrelid
    join pg_class t on t.oid=i.indrelid
    join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public'
      and t.relname='operations'
      and i.indisunique
      and (
        pg_get_indexdef(i.indexrelid) ilike '%transaction_identity_key%'
        or pg_get_indexdef(i.indexrelid) ilike '%transaction_fingerprint%'
      )
  ) then
    raise exception 'shadow_identity_must_not_be_unique_enforced';
  end if;
end;
$$;
