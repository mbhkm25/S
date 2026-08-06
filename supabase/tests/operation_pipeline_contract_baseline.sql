-- Test-only SANAD operation-pipeline contract baseline.
-- Derived from production catalog definitions on 2026-08-06.
-- It intentionally contains no rows, secrets, foreign keys, policies, or
-- application behavior outside the operation-pipeline dependency boundary.
-- Never place this file in supabase/migrations or apply it to production.

create schema if not exists private;
create schema if not exists app;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function public.normalize_financial_name(p_value text)
returns text language sql immutable set search_path='' as $$
  select nullif(lower(regexp_replace(trim(coalesce(p_value,'')),'\s+',' ','g')),'')
$$;

create or replace function public.normalize_financial_identifier(p_value text)
returns text language sql immutable set search_path='' as $$
  select nullif(regexp_replace(lower(coalesce(p_value,'')),'[^a-z0-9]','','g'),'')
$$;

create table private.operation_analysis_jobs (id uuid default gen_random_uuid() not null,
  operation_id uuid not null,
  status text default 'queued'::text not null,
  priority smallint default 100 not null,
  source text default 'app'::text not null,
  requested_by_user_id uuid,
  attempt_count integer default 0 not null,
  max_attempts integer default 3 not null,
  available_at timestamp with time zone default now() not null,
  locked_at timestamp with time zone,
  locked_by text,
  lease_expires_at timestamp with time zone,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  last_error_code text,
  last_error_message text,
  last_http_status integer,
  result_metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint operation_analysis_jobs_attempt_count_check CHECK (attempt_count >= 0),
  constraint operation_analysis_jobs_max_attempts_check CHECK (max_attempts >= 1 AND max_attempts <= 10),
  constraint operation_analysis_jobs_pkey PRIMARY KEY (id),
  constraint operation_analysis_jobs_priority_check CHECK (priority >= 0 AND priority <= 1000),
  constraint operation_analysis_jobs_status_check CHECK (status = ANY (ARRAY['queued'::text, 'processing'::text, 'retry_scheduled'::text, 'completed'::text, 'failed'::text, 'dead_letter'::text, 'cancelled'::text])));

create table private.operation_media_preview_jobs (id uuid default gen_random_uuid() not null,
  operation_id uuid not null,
  source_bucket text not null,
  source_path text not null,
  source_mime_type text not null,
  source_sha256 text,
  status text default 'pending'::text not null,
  attempt_count integer default 0 not null,
  available_at timestamp with time zone default now() not null,
  claimed_at timestamp with time zone,
  completed_at timestamp with time zone,
  last_error text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint operation_media_preview_jobs_operation_id_key UNIQUE (operation_id),
  constraint operation_media_preview_jobs_pkey PRIMARY KEY (id),
  constraint operation_media_preview_jobs_status_check CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text])));

create table private.sanad_worker_tokens (worker_name text not null,
  token_value text not null,
  is_active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint sanad_worker_tokens_pkey PRIMARY KEY (worker_name));

create table public.business_financial_accounts (id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  legacy_account_id text,
  financial_entity_code text not null,
  financial_entity_raw text,
  account_holder_name text,
  account_holder_name_normalized text generated always as (normalize_financial_name(account_holder_name)) stored,
  account_label text,
  is_multicurrency boolean default false not null,
  routing_enabled boolean default true not null,
  verification_status text default 'unverified'::text not null,
  verified_at timestamp with time zone,
  verified_by_user_id uuid,
  status text default 'active'::text not null,
  metadata jsonb default '{}'::jsonb not null,
  created_by_user_id uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint business_financial_accounts_holder_length CHECK (account_holder_name IS NULL OR char_length(account_holder_name) <= 200),
  constraint business_financial_accounts_label_length CHECK (account_label IS NULL OR char_length(account_label) <= 120),
  constraint business_financial_accounts_pkey PRIMARY KEY (id),
  constraint business_financial_accounts_raw_other_required CHECK (financial_entity_code <> 'other'::text OR NULLIF(btrim(COALESCE(financial_entity_raw, ''::text)), ''::text) IS NOT NULL),
  constraint business_financial_accounts_status_check CHECK (status = ANY (ARRAY['active'::text, 'suspended'::text, 'archived'::text])),
  constraint business_financial_accounts_verification_status_check CHECK (verification_status = ANY (ARRAY['unverified'::text, 'pending'::text, 'verified'::text, 'rejected'::text])));

create table public.business_financial_identifiers (id uuid default gen_random_uuid() not null,
  financial_account_id uuid not null,
  identifier_type text not null,
  identifier_value text not null,
  identifier_value_normalized text generated always as (normalize_financial_identifier(identifier_value)) stored,
  currency text,
  is_primary boolean default false not null,
  routing_enabled boolean default true not null,
  verification_status text default 'unverified'::text not null,
  status text default 'active'::text not null,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint business_financial_identifiers_currency_check CHECK (currency IS NULL OR (currency = ANY (ARRAY['YER'::text, 'SAR'::text, 'USD'::text]))),
  constraint business_financial_identifiers_identifier_type_check CHECK (identifier_type = ANY (ARRAY['account_number'::text, 'wallet_number'::text, 'customer_line'::text, 'merchant_point'::text, 'terminal_number'::text, 'phone_number'::text, 'national_id'::text, 'passport_number'::text, 'unique_account_name'::text, 'iban'::text, 'other'::text])),
  constraint business_financial_identifiers_normalized_required CHECK (identifier_value_normalized IS NOT NULL),
  constraint business_financial_identifiers_pkey PRIMARY KEY (id),
  constraint business_financial_identifiers_status_check CHECK (status = ANY (ARRAY['active'::text, 'suspended'::text, 'archived'::text])),
  constraint business_financial_identifiers_value_length CHECK (char_length(btrim(identifier_value)) >= 2 AND char_length(btrim(identifier_value)) <= 160),
  constraint business_financial_identifiers_verification_status_check CHECK (verification_status = ANY (ARRAY['unverified'::text, 'pending'::text, 'verified'::text, 'rejected'::text])));

create table public.business_payment_inbox (id uuid default gen_random_uuid() not null,
  business_id uuid not null,
  operation_id uuid not null,
  routing_shadow_run_id uuid,
  financial_account_id uuid,
  source_mode text default 'shadow'::text not null,
  status text default 'new'::text not null,
  priority smallint default 50 not null,
  match_score numeric,
  match_strategy text,
  routing_snapshot jsonb default '{}'::jsonb not null,
  claimed_by_user_id uuid,
  claimed_at timestamp with time zone,
  claim_expires_at timestamp with time zone,
  completed_by_user_id uuid,
  completed_at timestamp with time zone,
  completion_note text,
  released_by_user_id uuid,
  released_at timestamp with time zone,
  release_reason text,
  rejected_by_user_id uuid,
  rejected_at timestamp with time zone,
  rejection_reason text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  row_version bigint default 1 not null,
  claimed_source text,
  completed_source text,
  last_action_source text,
  review_requested_by_user_id uuid,
  review_requested_at timestamp with time zone,
  review_reason text,
  constraint business_payment_inbox_business_id_operation_id_key UNIQUE (business_id, operation_id),
  constraint business_payment_inbox_check CHECK (claimed_by_user_id IS NULL AND claimed_at IS NULL AND claim_expires_at IS NULL OR claimed_by_user_id IS NOT NULL AND claimed_at IS NOT NULL AND claim_expires_at IS NOT NULL),
  constraint business_payment_inbox_check1 CHECK (completed_by_user_id IS NULL AND completed_at IS NULL OR completed_by_user_id IS NOT NULL AND completed_at IS NOT NULL),
  constraint business_payment_inbox_check2 CHECK (released_at IS NULL AND released_by_user_id IS NULL OR released_at IS NOT NULL AND released_by_user_id IS NOT NULL OR released_at IS NOT NULL AND released_by_user_id IS NULL AND release_reason = 'claim_expired'::text),
  constraint business_payment_inbox_check3 CHECK (rejected_by_user_id IS NULL AND rejected_at IS NULL OR rejected_by_user_id IS NOT NULL AND rejected_at IS NOT NULL),
  constraint business_payment_inbox_match_score_check CHECK (match_score IS NULL OR match_score >= 0::numeric AND match_score <= 100::numeric),
  constraint business_payment_inbox_pkey PRIMARY KEY (id),
  constraint business_payment_inbox_priority_check CHECK (priority >= 0 AND priority <= 100),
  constraint business_payment_inbox_review_request_check CHECK (review_requested_by_user_id IS NULL AND review_requested_at IS NULL OR review_requested_by_user_id IS NOT NULL AND review_requested_at IS NOT NULL),
  constraint business_payment_inbox_routing_snapshot_check CHECK (jsonb_typeof(routing_snapshot) = 'object'::text),
  constraint business_payment_inbox_source_mode_check CHECK (source_mode = ANY (ARRAY['shadow'::text, 'canary'::text, 'live'::text, 'manual'::text, 'operational_match'::text])),
  constraint business_payment_inbox_status_check CHECK (status = ANY (ARRAY['new'::text, 'claimed'::text, 'completed'::text, 'released'::text, 'review_required'::text, 'rejected'::text, 'cancelled'::text])));

create table public.notifications (id uuid default gen_random_uuid() not null,
  recipient_user_id uuid not null,
  actor_user_id uuid,
  notification_type text not null,
  category text not null,
  severity text default 'info'::text not null,
  title text not null,
  body text not null,
  action_type text default 'none'::text not null,
  action_payload jsonb default '{}'::jsonb not null,
  business_id uuid,
  operation_id uuid,
  source_event_type text,
  source_event_id text,
  dedupe_key text not null,
  data jsonb default '{}'::jsonb not null,
  read_at timestamp with time zone,
  archived_at timestamp with time zone,
  expires_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint notifications_action_payload_object_check CHECK (jsonb_typeof(action_payload) = 'object'::text),
  constraint notifications_action_type_check CHECK (action_type = ANY (ARRAY['none'::text, 'operation_details'::text, 'reports'::text, 'business_invitation'::text, 'business_manage'::text, 'business_team'::text, 'business_operations'::text, 'business_public_profile'::text, 'pro_payment'::text, 'subscription'::text, 'profile'::text])),
  constraint notifications_body_length_check CHECK (length(body) >= 1 AND length(body) <= 1000),
  constraint notifications_category_check CHECK (category = ANY (ARRAY['operations'::text, 'reports'::text, 'business'::text, 'subscription'::text, 'security'::text, 'system'::text])),
  constraint notifications_data_object_check CHECK (jsonb_typeof(data) = 'object'::text),
  constraint notifications_dedupe_key_length_check CHECK (length(dedupe_key) >= 1 AND length(dedupe_key) <= 500),
  constraint notifications_expiry_check CHECK (expires_at IS NULL OR expires_at > created_at),
  constraint notifications_pkey PRIMARY KEY (id),
  constraint notifications_severity_check CHECK (severity = ANY (ARRAY['info'::text, 'success'::text, 'warning'::text, 'error'::text])),
  constraint notifications_source_event_id_length_check CHECK (source_event_id IS NULL OR length(source_event_id) <= 255),
  constraint notifications_source_event_type_length_check CHECK (source_event_type IS NULL OR length(source_event_type) <= 100),
  constraint notifications_title_length_check CHECK (length(title) >= 1 AND length(title) <= 160),
  constraint notifications_type_check CHECK (notification_type = ANY (ARRAY['operation_received'::text, 'operation_analysis_completed'::text, 'operation_analysis_failed'::text, 'operation_needs_review'::text, 'operation_verified'::text, 'report_requested'::text, 'report_ready'::text, 'report_failed'::text, 'business_invitation_received'::text, 'business_invitation_accepted'::text, 'business_member_status_changed'::text, 'business_operation_linked'::text, 'business_review_approved'::text, 'business_review_rejected'::text, 'pro_payment_submitted'::text, 'pro_payment_approved'::text, 'pro_payment_rejected'::text, 'subscription_expiring'::text, 'subscription_expired'::text, 'system_announcement'::text, 'payment_inbox_new'::text, 'payment_inbox_claimed'::text, 'payment_inbox_completed'::text, 'payment_inbox_released'::text, 'payment_inbox_review_required'::text])),
  constraint notifications_type_length_check CHECK (length(notification_type) >= 1 AND length(notification_type) <= 100));

create table public.operation_access_logs (id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  operation_id uuid not null,
  public_token uuid not null,
  access_month date not null,
  source text default 'link'::text not null,
  first_accessed_at timestamp with time zone default now() not null,
  last_accessed_at timestamp with time zone default now() not null,
  access_count integer default 1 not null,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint operation_access_logs_access_count_check CHECK (access_count > 0),
  constraint operation_access_logs_month_is_first_day CHECK (EXTRACT(day FROM access_month) = 1::numeric),
  constraint operation_access_logs_pkey PRIMARY KEY (id),
  constraint operation_access_logs_source_check CHECK (source = ANY (ARRAY['link'::text, 'qr'::text, 'search'::text, 'app'::text, 'manual'::text, 'unknown'::text])));

create table public.operation_events (id bigint generated by default as identity not null,
  operation_id uuid not null,
  event_type text not null,
  actor_user_id uuid,
  actor_phone text,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  source text,
  constraint operation_events_event_type_check CHECK (event_type = ANY (ARRAY['created'::text, 'file_uploaded'::text, 'qr_created'::text, 'opened'::text, 'file_opened'::text, 'uploader_linked'::text, 'verification_saved'::text, 'verified'::text, 'ai_started'::text, 'ai_completed'::text, 'ai_failed'::text, 'report_requested'::text, 'report_sent'::text, 'report_failed'::text, 'webhook_updated'::text, 'verification_recorded'::text, 'business_payment_enqueued'::text, 'business_payment_claimed'::text, 'business_payment_claim_renewed'::text, 'business_payment_expired_claim_released'::text, 'business_payment_released'::text, 'business_payment_completed'::text, 'business_payment_rejected'::text, 'business_payment_cancelled'::text, 'business_payment_reassigned'::text])),
  constraint operation_events_pkey PRIMARY KEY (id));

create table public.operation_fast_routing_extractions (id uuid default gen_random_uuid() not null,
  operation_id uuid not null,
  run_id uuid not null,
  extractor_version text not null,
  model text not null,
  status text not null,
  financial_entity text,
  financial_entity_code text,
  document_template text,
  transaction_direction text,
  amount numeric,
  currency text,
  receiver_name text,
  receiver_account text,
  receiver_identifier_type text,
  document_account text,
  credited_account text,
  merchant_point text,
  field_confidences jsonb default '{}'::jsonb not null,
  field_evidence jsonb default '{}'::jsonb not null,
  raw_json jsonb default '{}'::jsonb not null,
  duration_ms integer,
  error_message text,
  created_at timestamp with time zone default now() not null,
  constraint operation_fast_routing_extrac_operation_id_run_id_extractor_key UNIQUE (operation_id, run_id, extractor_version),
  constraint operation_fast_routing_extractions_duration_ms_check CHECK (duration_ms IS NULL OR duration_ms >= 0 AND duration_ms <= 3600000),
  constraint operation_fast_routing_extractions_field_confidences_check CHECK (jsonb_typeof(field_confidences) = 'object'::text),
  constraint operation_fast_routing_extractions_field_evidence_check CHECK (jsonb_typeof(field_evidence) = 'object'::text),
  constraint operation_fast_routing_extractions_pkey PRIMARY KEY (id),
  constraint operation_fast_routing_extractions_raw_json_check CHECK (jsonb_typeof(raw_json) = 'object'::text),
  constraint operation_fast_routing_extractions_status_check CHECK (status = ANY (ARRAY['completed'::text, 'failed'::text, 'skipped'::text])));

create table public.operation_pipeline_spans (id bigint generated by default as identity not null,
  operation_id uuid not null,
  run_id uuid not null,
  pipeline text not null,
  stage text not null,
  status text not null,
  function_name text not null,
  started_at timestamp with time zone not null,
  completed_at timestamp with time zone not null,
  duration_ms integer not null,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  constraint operation_pipeline_spans_duration_ms_check CHECK (duration_ms >= 0 AND duration_ms <= 3600000),
  constraint operation_pipeline_spans_metadata_check CHECK (jsonb_typeof(metadata) = 'object'::text),
  constraint operation_pipeline_spans_operation_id_run_id_pipeline_stage_key UNIQUE (operation_id, run_id, pipeline, stage),
  constraint operation_pipeline_spans_pipeline_check CHECK (pipeline = ANY (ARRAY['whatsapp_intake'::text, 'analysis'::text, 'fast_routing'::text, 'routing'::text, 'payment_inbox'::text])),
  constraint operation_pipeline_spans_pkey PRIMARY KEY (id),
  constraint operation_pipeline_spans_stage_check CHECK (stage ~ '^[a-z0-9_]{2,80}$'::text),
  constraint operation_pipeline_spans_status_check CHECK (status = ANY (ARRAY['success'::text, 'error'::text, 'skipped'::text])));

create table public.operation_user_links (id uuid default gen_random_uuid() not null,
  operation_id uuid not null,
  user_id uuid,
  phone text,
  relation_type text not null,
  source text default 'system'::text not null,
  first_seen_at timestamp with time zone default now() not null,
  last_seen_at timestamp with time zone default now() not null,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  constraint operation_user_links_identity_check CHECK (user_id IS NOT NULL OR phone IS NOT NULL),
  constraint operation_user_links_pkey PRIMARY KEY (id),
  constraint operation_user_links_relation_type_check CHECK (relation_type = ANY (ARRAY['uploader'::text, 'verifier'::text, 'viewer'::text])),
  constraint operation_user_links_source_check CHECK (source = ANY (ARRAY['system'::text, 'pwa_upload'::text, 'share_target'::text, 'qr_scan'::text, 'token_open'::text, 'manual'::text, 'whatsapp'::text, 'api'::text, 'payment_inbox'::text, 'qr_details'::text, 'direct_link'::text, 'operation_details'::text, 'business_link_after_verification'::text, 'notification'::text, 'admin'::text])));

create table public.operations (id uuid default gen_random_uuid() not null,
  public_token uuid default gen_random_uuid() not null,
  token_status text default 'active'::text not null,
  token_expires_at timestamp with time zone,
  source text default 'pwa_upload'::text not null,
  upload_origin text,
  submitted_by_user_id uuid,
  submitted_by_phone text,
  submitted_by_name text,
  file_bucket text default 'operation-files'::text not null,
  file_path text,
  file_original_name text,
  file_mime_type text,
  file_size bigint,
  file_sha256 text,
  storage_metadata jsonb default '{}'::jsonb not null,
  original_file_status text default 'stored'::text not null,
  qr_status text default 'created'::text not null,
  status text default 'stored'::text not null,
  ai_status text default 'pending'::text not null,
  ai_model text,
  ai_error text,
  raw_ai_json jsonb default '{}'::jsonb not null,
  summary text,
  structured_data jsonb default '{}'::jsonb not null,
  financial_entity text,
  transaction_type text,
  amount numeric,
  currency text,
  reference_number text,
  transaction_datetime timestamp with time zone,
  confidence_score numeric,
  ai_confidence_score numeric,
  sanad_confidence_score numeric,
  sanad_risk_level text default 'unknown'::text not null,
  sanad_review_status text default 'not_required'::text not null,
  sanad_time_check jsonb default '{}'::jsonb not null,
  sanad_warnings jsonb default '[]'::jsonb not null,
  sanad_attention_points jsonb default '[]'::jsonb not null,
  visual_integrity_notes jsonb default '[]'::jsonb not null,
  missing_fields jsonb default '[]'::jsonb not null,
  possible_fraud boolean default false not null,
  verified_by_user_id uuid,
  verified_at timestamp with time zone,
  verification_note text,
  client_upload_metadata jsonb default '{}'::jsonb not null,
  raw_webhook_json jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  transaction_date date,
  transaction_time time without time zone,
  transaction_time_present boolean default false not null,
  transaction_date_source text,
  transaction_timezone text,
  received_at timestamp with time zone default now() not null,
  received_timezone text default 'Asia/Aden'::text not null,
  analysis_contract_version smallint default 1 not null,
  analysis_prompt_version integer,
  analysis_completed_at timestamp with time zone,
  financial_entity_code text,
  document_template text,
  document_template_confidence numeric,
  transaction_direction text,
  transaction_direction_confidence numeric,
  sender_name text,
  receiver_name text,
  sender_account text,
  receiver_account text,
  sender_identifier_type text,
  receiver_identifier_type text,
  document_account text,
  credited_account text,
  debited_account text,
  merchant_point text,
  multiple_operations_present boolean default false not null,
  selected_operation_position smallint,
  field_confidences jsonb default '{}'::jsonb not null,
  field_evidence jsonb default '{}'::jsonb not null,
  sender_name_normalized text generated always as (normalize_financial_name(sender_name)) stored,
  receiver_name_normalized text generated always as (normalize_financial_name(receiver_name)) stored,
  sender_account_normalized text generated always as (normalize_financial_identifier(sender_account)) stored,
  receiver_account_normalized text generated always as (normalize_financial_identifier(receiver_account)) stored,
  document_account_normalized text generated always as (normalize_financial_identifier(document_account)) stored,
  credited_account_normalized text generated always as (normalize_financial_identifier(credited_account)) stored,
  debited_account_normalized text generated always as (normalize_financial_identifier(debited_account)) stored,
  merchant_point_normalized text generated always as (normalize_financial_identifier(merchant_point)) stored,
  preview_status text default 'pending'::text not null,
  preview_bucket text,
  preview_path text,
  preview_mime_type text,
  preview_size bigint,
  preview_width integer,
  preview_height integer,
  preview_generated_at timestamp with time zone,
  preview_error text,
  preview_source_sha256 text,
  preview_attempt_count integer default 0 not null,
  constraint operations_ai_confidence_score_check CHECK (ai_confidence_score IS NULL OR ai_confidence_score >= 0::numeric AND ai_confidence_score <= 1::numeric),
  constraint operations_ai_status_check CHECK (ai_status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text, 'skipped'::text])),
  constraint operations_confidence_score_check CHECK (confidence_score IS NULL OR confidence_score >= 0::numeric AND confidence_score <= 1::numeric),
  constraint operations_currency_check CHECK (currency IS NULL OR (currency = ANY (ARRAY['YER'::text, 'SAR'::text, 'USD'::text]))),
  constraint operations_document_template_check CHECK (document_template IS NULL OR (document_template = ANY (ARRAY['single_receipt'::text, 'transaction_list'::text, 'account_history'::text, 'wallet_receipt'::text, 'transfer_receipt'::text, 'statement'::text, 'unknown'::text]))),
  constraint operations_document_template_confidence_check CHECK (document_template_confidence IS NULL OR document_template_confidence >= 0::numeric AND document_template_confidence <= 1::numeric),
  constraint operations_field_confidences_object_check CHECK (jsonb_typeof(field_confidences) = 'object'::text),
  constraint operations_field_evidence_object_check CHECK (jsonb_typeof(field_evidence) = 'object'::text),
  constraint operations_file_size_check CHECK (file_size IS NULL OR file_size >= 0),
  constraint operations_original_file_status_check CHECK (original_file_status = ANY (ARRAY['pending'::text, 'stored'::text, 'missing'::text, 'deleted'::text, 'failed'::text])),
  constraint operations_pkey PRIMARY KEY (id),
  constraint operations_preview_mime_type_check CHECK (preview_mime_type IS NULL OR preview_mime_type = 'image/webp'::text),
  constraint operations_preview_status_check CHECK (preview_status = ANY (ARRAY['pending'::text, 'processing'::text, 'ready'::text, 'failed'::text, 'not_required'::text])),
  constraint operations_public_token_key UNIQUE (public_token),
  constraint operations_qr_status_check CHECK (qr_status = ANY (ARRAY['created'::text, 'revoked'::text, 'expired'::text])),
  constraint operations_received_timezone_check CHECK (received_timezone = 'Asia/Aden'::text),
  constraint operations_receiver_identifier_type_check CHECK (receiver_identifier_type IS NULL OR (receiver_identifier_type = ANY (ARRAY['account_number'::text, 'wallet_number'::text, 'financial_line'::text, 'merchant_point'::text, 'terminal_number'::text, 'phone_number'::text, 'iban'::text, 'other'::text, 'unknown'::text]))),
  constraint operations_sanad_confidence_score_check CHECK (sanad_confidence_score IS NULL OR sanad_confidence_score >= 0::numeric AND sanad_confidence_score <= 1::numeric),
  constraint operations_sanad_review_status_check CHECK (sanad_review_status = ANY (ARRAY['not_required'::text, 'pending'::text, 'needs_review'::text, 'reviewed'::text, 'rejected'::text])),
  constraint operations_sanad_risk_level_check CHECK (sanad_risk_level = ANY (ARRAY['unknown'::text, 'low'::text, 'medium'::text, 'high'::text])),
  constraint operations_selected_operation_position_check CHECK (selected_operation_position IS NULL OR selected_operation_position >= 1 AND selected_operation_position <= 100),
  constraint operations_sender_identifier_type_check CHECK (sender_identifier_type IS NULL OR (sender_identifier_type = ANY (ARRAY['account_number'::text, 'wallet_number'::text, 'financial_line'::text, 'merchant_point'::text, 'terminal_number'::text, 'phone_number'::text, 'iban'::text, 'other'::text, 'unknown'::text]))),
  constraint operations_source_check CHECK (source = ANY (ARRAY['pwa_upload'::text, 'share_target'::text, 'whatsapp'::text, 'manual'::text, 'api'::text])),
  constraint operations_status_check CHECK (status = ANY (ARRAY['stored'::text, 'processing'::text, 'ready'::text, 'verified'::text, 'failed'::text, 'cancelled'::text])),
  constraint operations_token_status_check CHECK (token_status = ANY (ARRAY['active'::text, 'revoked'::text, 'expired'::text])),
  constraint operations_transaction_date_source_check CHECK (transaction_date_source IS NULL OR (transaction_date_source = ANY (ARRAY['labeled_date'::text, 'single_detected_date'::text, 'explicit_datetime'::text, 'document_time'::text, 'legacy_datetime'::text, 'manual_correction'::text, 'unknown'::text]))),
  constraint operations_transaction_direction_check CHECK (transaction_direction IS NULL OR (transaction_direction = ANY (ARRAY['incoming'::text, 'outgoing'::text, 'internal'::text, 'unknown'::text]))),
  constraint operations_transaction_direction_confidence_check CHECK (transaction_direction_confidence IS NULL OR transaction_direction_confidence >= 0::numeric AND transaction_direction_confidence <= 1::numeric),
  constraint operations_transaction_time_consistency_check CHECK (transaction_time_present AND transaction_time IS NOT NULL OR NOT transaction_time_present AND transaction_time IS NULL));

create table public.platform_admin_audit_log (id bigint generated always as identity not null,
  actor_user_id uuid not null,
  action text not null,
  target_type text not null,
  target_id text,
  reason text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamp with time zone default now() not null,
  constraint platform_admin_audit_log_pkey PRIMARY KEY (id));

create table public.profiles (id uuid not null,
  full_name text,
  phone text,
  avatar_path text,
  status text default 'active'::text not null,
  global_role text default 'user'::text not null,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  governorate text,
  profile_completed_at timestamp with time zone,
  business_discovery_scope text default 'profile_governorate'::text not null,
  business_discovery_governorate text,
  pending_phone text,
  phone_verification_status text default 'unverified'::text not null,
  phone_verified_at timestamp with time zone,
  phone_verification_updated_at timestamp with time zone default now() not null,
  constraint profiles_business_discovery_scope_check CHECK (business_discovery_scope = ANY (ARRAY['profile_governorate'::text, 'governorate'::text, 'all_yemen'::text])),
  constraint profiles_global_role_check CHECK (global_role = ANY (ARRAY['user'::text, 'platform_admin'::text])),
  constraint profiles_pending_phone_format_chk CHECK (pending_phone IS NULL OR pending_phone ~ '^967[0-9]{9}$'::text),
  constraint profiles_phone_e164_format_chk CHECK (phone IS NULL OR phone ~ '^[1-9][0-9]{7,14}$'::text),
  constraint profiles_phone_key UNIQUE (phone),
  constraint profiles_phone_verification_status_chk CHECK (phone_verification_status = ANY (ARRAY['unverified'::text, 'pending'::text, 'verified'::text, 'rejected'::text, 'conflict'::text, 'expired'::text])),
  constraint profiles_pkey PRIMARY KEY (id),
  constraint profiles_status_check CHECK (status = ANY (ARRAY['active'::text, 'pending'::text, 'disabled'::text])));

create table public.sanad_transactional_message_outbox (id uuid default gen_random_uuid() not null,
  event_type text not null,
  recipient_user_id uuid not null,
  phone_normalized text not null,
  source_type text not null,
  source_id text not null,
  notification_id uuid,
  template_name text not null,
  template_language text default 'ar'::text not null,
  template_parameters jsonb default '[]'::jsonb not null,
  payload jsonb default '{}'::jsonb not null,
  status text default 'pending'::text not null,
  attempt_count integer default 0 not null,
  max_attempts integer default 5 not null,
  next_attempt_at timestamp with time zone default now() not null,
  claimed_at timestamp with time zone,
  external_message_id text,
  last_error text,
  sent_at timestamp with time zone,
  delivered_at timestamp with time zone,
  read_at timestamp with time zone,
  failed_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint sanad_transactional_message_o_event_type_recipient_user_id__key UNIQUE (event_type, recipient_user_id, source_type, source_id),
  constraint sanad_transactional_message_outbox_pkey PRIMARY KEY (id),
  constraint sanad_transactional_message_outbox_status_check CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'sent'::text, 'delivered'::text, 'read'::text, 'failed'::text, 'cancelled'::text])));

create table public.sanad_transactional_message_rules (event_type text not null,
  display_name text not null,
  description text,
  enabled boolean default false not null,
  template_name text,
  template_language text default 'ar'::text not null,
  parameter_keys jsonb default '[]'::jsonb not null,
  max_attempts integer default 5 not null,
  updated_by uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint sanad_transactional_message_rules_max_attempts_check CHECK (max_attempts >= 1 AND max_attempts <= 10),
  constraint sanad_transactional_message_rules_pkey PRIMARY KEY (event_type),
  constraint sanad_transactional_rule_event_check CHECK (event_type = ANY (ARRAY['report_requested'::text, 'report_ready'::text, 'report_failed'::text, 'pro_payment_submitted'::text, 'pro_payment_approved'::text, 'pro_payment_rejected'::text, 'subscription_expiring'::text, 'subscription_expired'::text, 'business_review_approved'::text, 'business_review_rejected'::text])),
  constraint sanad_transactional_rule_parameters_check CHECK (jsonb_typeof(parameter_keys) = 'array'::text),
  constraint sanad_transactional_rule_template_check CHECK (template_name IS NULL OR length(template_name) >= 1 AND length(template_name) <= 512 AND template_name ~ '^[a-z0-9_]+$'::text));

create table public.sanad_whatsapp_contacts (id uuid default gen_random_uuid() not null,
  phone_normalized text not null,
  wa_id text,
  display_name text,
  linked_user_id uuid,
  registration_status text default 'whatsapp_only'::text not null,
  onboarding_status text default 'not_sent'::text not null,
  transactional_status text default 'active'::text not null,
  marketing_status text default 'unknown'::text not null,
  welcome_message_version integer default 1 not null,
  welcome_message_sent_at timestamp with time zone,
  welcome_message_id text,
  welcome_last_error text,
  first_seen_at timestamp with time zone default now() not null,
  last_seen_at timestamp with time zone default now() not null,
  first_operation_at timestamp with time zone,
  last_operation_at timestamp with time zone,
  messages_count integer default 0 not null,
  supported_messages_count integer default 0 not null,
  operations_count integer default 0 not null,
  acquisition_source text default 'whatsapp'::text not null,
  metadata jsonb default '{}'::jsonb not null,
  blocked_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint sanad_whatsapp_contacts_marketing_status_check CHECK (marketing_status = ANY (ARRAY['unknown'::text, 'opted_in'::text, 'opted_out'::text])),
  constraint sanad_whatsapp_contacts_messages_count_check CHECK (messages_count >= 0),
  constraint sanad_whatsapp_contacts_onboarding_status_check CHECK (onboarding_status = ANY (ARRAY['not_sent'::text, 'queued'::text, 'sending'::text, 'sent'::text, 'failed'::text, 'install_page_visited'::text, 'registration_started'::text, 'registered'::text])),
  constraint sanad_whatsapp_contacts_operations_count_check CHECK (operations_count >= 0),
  constraint sanad_whatsapp_contacts_phone_normalized_check CHECK (phone_normalized ~ '^967[0-9]{9}$'::text),
  constraint sanad_whatsapp_contacts_phone_normalized_key UNIQUE (phone_normalized),
  constraint sanad_whatsapp_contacts_pkey PRIMARY KEY (id),
  constraint sanad_whatsapp_contacts_registration_status_check CHECK (registration_status = ANY (ARRAY['whatsapp_only'::text, 'registered'::text, 'profile_completed'::text, 'pro_user'::text, 'blocked'::text])),
  constraint sanad_whatsapp_contacts_supported_messages_count_check CHECK (supported_messages_count >= 0),
  constraint sanad_whatsapp_contacts_transactional_status_check CHECK (transactional_status = ANY (ARRAY['active'::text, 'blocked'::text])),
  constraint sanad_whatsapp_contacts_welcome_message_version_check CHECK (welcome_message_version > 0));

create unique index operation_analysis_jobs_one_active_per_operation
on private.operation_analysis_jobs(operation_id)
where status in('queued','processing','retry_scheduled');

alter table private.operation_analysis_jobs enable row level security;
alter table private.operation_media_preview_jobs enable row level security;
alter table private.sanad_worker_tokens enable row level security;
revoke all on all tables in schema private from public,anon,authenticated;

create or replace function app.link_operation_user(
  p_operation_id uuid,p_user_id uuid,p_phone text,p_relation_type text,
  p_source text,p_metadata jsonb
) returns void language plpgsql security definer set search_path='' as $$
begin
  if p_user_id is null and nullif(p_phone,'') is null then return; end if;
  insert into public.operation_user_links(
    operation_id,user_id,phone,relation_type,source,metadata
  ) values(
    p_operation_id,p_user_id,p_phone,p_relation_type,p_source,
    coalesce(p_metadata,'{}'::jsonb)
  );
end $$;

create or replace function private.operation_preview_supported_mime(p_mime text)
returns boolean language sql immutable set search_path='' as $$
  select lower(split_part(coalesce(p_mime,''),';',1)) in(
    'image/jpeg','image/png','image/webp','application/pdf'
  )
$$;

create or replace function private.enqueue_operation_media_preview()
returns trigger language plpgsql set search_path='' as $$
begin return new; end $$;

create or replace function private.capture_whatsapp_operation_contact()
returns trigger language plpgsql security definer set search_path='' as $$
begin return new; end $$;

create trigger trg_capture_whatsapp_operation_contact
after insert on public.operations for each row
when (new.source='whatsapp')
execute function private.capture_whatsapp_operation_contact();

create or replace function app.after_operation_insert_link_uploader()
returns trigger language plpgsql set search_path='' as $$
begin return new; end $$;

create trigger trg_operations_after_insert_link_uploader
after insert on public.operations for each row
execute function app.after_operation_insert_link_uploader();

create trigger operations_enqueue_media_preview
after insert or update of file_bucket,file_path,file_mime_type,file_sha256
on public.operations for each row
execute function private.enqueue_operation_media_preview();

create or replace function private.record_business_payment_inbox_event(
  p_inbox_id uuid,p_event_type text,p_actor_user_id uuid,p_from_status text,
  p_to_status text,p_reason text,p_metadata jsonb
) returns void language plpgsql set search_path='' as $$
begin return; end $$;

create or replace function private.notify_business_payment_inbox(p_inbox_id uuid)
returns void language plpgsql set search_path='' as $$
begin return; end $$;

create or replace function private.notify_business_payment_review_required(p_inbox_id uuid)
returns void language plpgsql set search_path='' as $$
begin return; end $$;

create or replace function public.evaluate_operation_financial_routing_shadow(
  p_operation_id uuid
) returns jsonb language sql set search_path='' as $$
  select jsonb_build_object('ok',false,'reason','branch_fixture_no_shadow_match')
$$;

create or replace function public.is_platform_admin(user_id uuid)
returns boolean language sql stable set search_path='' as $$
  select false
$$;

create or replace function private.normalize_yemen_phone(p_phone text)
returns text language sql immutable set search_path='' as $$
  select case
    when regexp_replace(coalesce(p_phone,''),'[^0-9]','','g')~'^967[0-9]{9}$'
      then regexp_replace(p_phone,'[^0-9]','','g')
    when regexp_replace(coalesce(p_phone,''),'[^0-9]','','g')~'^0[0-9]{9}$'
      then '967'||substr(regexp_replace(p_phone,'[^0-9]','','g'),2)
    when regexp_replace(coalesce(p_phone,''),'[^0-9]','','g')~'^[0-9]{9}$'
      then '967'||regexp_replace(p_phone,'[^0-9]','','g')
    else null
  end
$$;

create or replace function private.render_transactional_parameters(
  p_keys jsonb,p_profile public.profiles,p_notification public.notifications
) returns jsonb language sql stable set search_path='' as $$
  select '[]'::jsonb
$$;
