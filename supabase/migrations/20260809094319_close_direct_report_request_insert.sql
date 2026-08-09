-- Report requests must be created only through the validated SECURITY DEFINER RPCs.
-- Direct authenticated INSERT allowed a caller to forge a business context for a
-- business they do not own; the report worker would then build that business payload.
revoke insert on table public.report_requests from authenticated;

-- Keep read access for the requester's own history through existing RLS.
grant select on table public.report_requests to authenticated;
