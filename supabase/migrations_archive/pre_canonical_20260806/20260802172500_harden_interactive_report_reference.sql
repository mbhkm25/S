begin;

alter table public.report_requests
  drop column if exists interactive_url;

alter table public.report_requests
  drop constraint if exists report_requests_interactive_report_id_fkey;

alter table public.report_requests
  add constraint report_requests_interactive_report_id_fkey
  foreign key (interactive_report_id)
  references public.report_snapshots(id)
  on delete set null;

create index if not exists report_requests_interactive_report_id_idx
  on public.report_requests(interactive_report_id)
  where interactive_report_id is not null;

comment on column public.report_requests.interactive_report_id is
'References the immutable report snapshot. Raw interactive access tokens are never stored on report_requests.';

commit;
