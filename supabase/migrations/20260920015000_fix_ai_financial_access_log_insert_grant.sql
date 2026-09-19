-- Allow authenticated users to write their own AI financial access log rows.
-- RLS already enforces user_id = auth.uid(); this grant enables the existing policy.

grant insert on table public.ai_financial_context_access_log to authenticated;
