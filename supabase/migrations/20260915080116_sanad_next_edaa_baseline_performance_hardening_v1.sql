create index business_erp_baseline_runs_location_idx
  on public.business_erp_baseline_runs(location_id)
  where location_id is not null;
