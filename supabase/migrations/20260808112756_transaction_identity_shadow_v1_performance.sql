-- Follow-up for Transaction Identity Shadow v1 performance advisor.
create index if not exists operation_submissions_matched_operation_idx
  on private.operation_submissions (matched_operation_id)
  where matched_operation_id is not null;
