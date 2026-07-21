create table public.operation_notes (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.operations(id) on delete cascade,
  author_user_id uuid not null references public.profiles(id) on delete cascade,
  note_type text not null check (note_type in ('text', 'audio')),
  text_content text,
  audio_bucket text,
  audio_path text,
  audio_mime_type text,
  audio_duration_seconds integer,
  audio_size_bytes bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operation_notes_one_per_user unique (operation_id, author_user_id),
  constraint operation_notes_text_length check (
    text_content is null or char_length(text_content) between 1 and 2000
  ),
  constraint operation_notes_audio_duration check (
    audio_duration_seconds is null or audio_duration_seconds between 1 and 180
  ),
  constraint operation_notes_audio_size check (
    audio_size_bytes is null or audio_size_bytes between 1 and 10485760
  ),
  constraint operation_notes_payload_by_type check (
    (
      note_type = 'text'
      and text_content is not null
      and audio_bucket is null
      and audio_path is null
      and audio_mime_type is null
      and audio_duration_seconds is null
      and audio_size_bytes is null
    )
    or
    (
      note_type = 'audio'
      and text_content is null
      and audio_bucket = 'operation-note-audio'
      and audio_path is not null
      and audio_mime_type in ('audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/x-m4a')
      and audio_duration_seconds is not null
      and audio_size_bytes is not null
    )
  )
);

comment on table public.operation_notes is
  'Private per-user note attached to an operation after the user verifies it.';

create index operation_notes_author_updated_idx
  on public.operation_notes (author_user_id, updated_at desc);

alter table public.operation_notes enable row level security;

create policy operation_notes_select_own
  on public.operation_notes
  for select
  to authenticated
  using ((select auth.uid()) = author_user_id);

create policy operation_notes_insert_own_verifier
  on public.operation_notes
  for insert
  to authenticated
  with check (
    (select auth.uid()) = author_user_id
    and exists (
      select 1
      from public.operation_user_links l
      where l.operation_id = operation_notes.operation_id
        and l.user_id = (select auth.uid())
        and l.relation_type = 'verifier'
    )
  );

create policy operation_notes_update_own_verifier
  on public.operation_notes
  for update
  to authenticated
  using ((select auth.uid()) = author_user_id)
  with check (
    (select auth.uid()) = author_user_id
    and exists (
      select 1
      from public.operation_user_links l
      where l.operation_id = operation_notes.operation_id
        and l.user_id = (select auth.uid())
        and l.relation_type = 'verifier'
    )
  );

create policy operation_notes_delete_own
  on public.operation_notes
  for delete
  to authenticated
  using ((select auth.uid()) = author_user_id);

revoke all on table public.operation_notes from public, anon;
grant select, insert, update, delete on table public.operation_notes to authenticated;

create trigger operation_notes_set_updated_at
before update on public.operation_notes
for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'operation-note-audio',
  'operation-note-audio',
  false,
  10485760,
  array['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/x-m4a']::text[]
);

create policy operation_note_audio_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'operation-note-audio'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy operation_note_audio_select_own
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'operation-note-audio'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy operation_note_audio_delete_own
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'operation-note-audio'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
