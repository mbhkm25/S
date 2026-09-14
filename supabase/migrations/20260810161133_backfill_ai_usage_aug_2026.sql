insert into public.ai_usage_ledger (occurred_at,request_id,operation_id,source,purpose,environment,model,billing_mode,status,prompt_tokens,cached_tokens,candidate_tokens,thinking_tokens,total_tokens,input_cost_usd,cached_input_cost_usd,output_cost_usd,usage_metadata,metadata)
select coalesce(o.analysis_completed_at,o.updated_at,o.created_at),'historical:operation:'||o.id::text,o.id,'sanad-v3-analyze-operation','operation_analysis','production',o.ai_model,'standard',coalesce(o.ai_status,'unknown'),
coalesce((o.raw_ai_json#>>'{gemini_metadata,usage_metadata,promptTokenCount}')::bigint,0),coalesce((o.raw_ai_json#>>'{gemini_metadata,usage_metadata,cachedContentTokenCount}')::bigint,0),coalesce((o.raw_ai_json#>>'{gemini_metadata,usage_metadata,candidatesTokenCount}')::bigint,0),coalesce((o.raw_ai_json#>>'{gemini_metadata,usage_metadata,thoughtsTokenCount}')::bigint,0),coalesce((o.raw_ai_json#>>'{gemini_metadata,usage_metadata,totalTokenCount}')::bigint,0),
greatest(coalesce((o.raw_ai_json#>>'{gemini_metadata,usage_metadata,promptTokenCount}')::bigint,0)-coalesce((o.raw_ai_json#>>'{gemini_metadata,usage_metadata,cachedContentTokenCount}')::bigint,0),0)*0.30/1000000.0,
coalesce((o.raw_ai_json#>>'{gemini_metadata,usage_metadata,cachedContentTokenCount}')::bigint,0)*0.03/1000000.0,
(coalesce((o.raw_ai_json#>>'{gemini_metadata,usage_metadata,candidatesTokenCount}')::bigint,0)+coalesce((o.raw_ai_json#>>'{gemini_metadata,usage_metadata,thoughtsTokenCount}')::bigint,0))*2.50/1000000.0,
coalesce(o.raw_ai_json#>'{gemini_metadata,usage_metadata}','{}'::jsonb),jsonb_build_object('backfill',true)
from public.operations o
where o.created_at >= '2026-08-01'::timestamptz and o.ai_model='gemini-2.5-flash' and o.raw_ai_json#>'{gemini_metadata,usage_metadata}' is not null
on conflict (request_id) where request_id is not null do nothing;
