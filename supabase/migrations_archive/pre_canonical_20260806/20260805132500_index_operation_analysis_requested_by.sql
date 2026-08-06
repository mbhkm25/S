begin;

create index if not exists operation_analysis_jobs_requested_by_user_idx
  on private.operation_analysis_jobs(requested_by_user_id)
  where requested_by_user_id is not null;

commit;
