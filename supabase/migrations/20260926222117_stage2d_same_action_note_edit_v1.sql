-- Stage 2D.2-A: narrow safe same-action note edit, not general form mutation.
-- Only owner, review status and exact expected version. No domain execution.
-- Preserve canonical ID, actor, source thread/business, financial fields,
-- attachments, metadata, review consequence and approval isolation.
alter table public.sanad_agent_action_events
  drop constraint if exists sanad_agent_action_events_event_type_check;
alter table public.sanad_agent_action_events
  add constraint sanad_agent_action_events_event_type_check
  check (event_type in ('created','edited','approved','executing','completed','cancelled','failed'));

create or replace function public.update_my_sanad_agent_action_note_v1(
  p_action_id uuid,
  p_expected_version integer,
  p_note text
) returns jsonb
language plpgsql volatile security definer set search_path=''
as $function$
declare
 v_uid uuid := auth.uid();
 v_row public.sanad_agent_actions%rowtype;
 v_thread public.sanad_agent_threads%rowtype;
 v_note text;
 v_payload jsonb;
 v_review jsonb;
 v_fields jsonb;
 v_fingerprint text;
begin
 if v_uid is null then
   raise exception 'authentication_required' using errcode='42501';
 end if;
 if p_expected_version is null or p_expected_version<1 then
   raise exception 'valid_expected_version_required' using errcode='22023';
 end if;
 if p_note is null or length(p_note)>500 then
   raise exception 'action_note_too_long_or_missing' using errcode='22023';
 end if;

 select * into v_row from public.sanad_agent_actions
 where id=p_action_id and user_id=v_uid for update;
 if not found then
   raise exception 'agent_action_not_found' using errcode='P0002';
 end if;
 if v_row.status<>'review' then
   raise exception 'agent_action_not_editable' using errcode='22023';
 end if;
 if v_row.version<>p_expected_version then
   raise exception 'agent_action_version_conflict' using errcode='40001';
 end if;

 select * into v_thread from public.sanad_agent_threads
 where id=v_row.thread_id and user_id=v_uid and status='active';
 if not found then
   raise exception 'agent_action_thread_invalid' using errcode='42501';
 end if;

 v_note := nullif(btrim(p_note),'');
 v_payload := v_row.payload;
 v_review := v_row.review;
 if v_row.action_type='personal_transaction' then
   if v_thread.project_kind is distinct from 'personal'
     or v_thread.business_id is not null or v_row.business_id is not null then
     raise exception 'agent_action_personal_project_required' using errcode='42501';
   end if;
   v_payload := jsonb_set(v_payload,'{description}',coalesce(to_jsonb(v_note),'null'::jsonb),true);
   v_review := jsonb_set(
      v_review,'{summary}',
      to_jsonb(coalesce(v_note,
        case v_payload->>'transaction_type'
          when 'income' then 'دخل شخصي'
          when 'expense' then 'مصروف شخصي'
          else 'تحويل بين حسابين شخصيين'
        end)),true
   );
 elsif v_row.action_type='commercial_document_draft' then
   if v_thread.project_kind is distinct from 'business'
     or v_thread.business_id is null
     or v_thread.business_id is distinct from v_row.business_id
     or not private.user_is_business_owner(v_row.business_id,v_uid) then
     raise exception 'agent_action_business_project_mismatch' using errcode='42501';
   end if;
   v_payload := jsonb_set(v_payload,'{notes}',coalesce(to_jsonb(v_note),'null'::jsonb),true);
   -- Note edits are visibly included in the server-generated review summary
   -- without changing type/party/currency/amount/source/approval_effect.
   select coalesce(jsonb_agg(field order by ordinal), '[]'::jsonb)
     into v_fields from jsonb_array_elements(coalesce(v_review->'fields','[]'::jsonb))
      with ordinality as fields(field,ordinal)
     where field->>'label'<>'ملاحظات';
   if v_note is not null then
     v_fields := v_fields || jsonb_build_array(
       jsonb_build_object('label','ملاحظات','value',v_note)
     );
   end if;
   v_review := jsonb_set(v_review,'{fields}',v_fields,true);
 else
   raise exception 'agent_action_type_not_allowed' using errcode='22023';
 end if;

 if v_payload is not distinct from v_row.payload then
   return to_jsonb(v_row);
 end if;

 v_fingerprint := md5(v_row.action_type||'|'||v_row.thread_id::text||'|'||
                      (v_payload - 'metadata')::text);
 if exists(
   select 1 from public.sanad_agent_actions a
   where a.user_id=v_uid and a.id<>v_row.id and a.fingerprint=v_fingerprint
     and a.status in ('review','approved','executing')
 ) then
   raise exception 'identical_active_action_already_exists' using errcode='23505';
 end if;

 update public.sanad_agent_actions set
   payload=v_payload, review=v_review, fingerprint=v_fingerprint,
   version=version+1, updated_at=now()
 where id=v_row.id and user_id=v_uid and status='review'
 returning * into v_row;
 if not found then
   raise exception 'agent_action_concurrent_edit' using errcode='40001';
 end if;
 insert into public.sanad_agent_action_events(
   action_id,user_id,event_type,data
 ) values (
   v_row.id,v_uid,'edited',jsonb_build_object(
     'field',case when v_row.action_type='personal_transaction' then 'description' else 'notes' end,
     'version',v_row.version,'source','ui_explicit'
   )
 );

 -- Stage 2B's action-event projector intentionally has no 'edited' work-item
 -- branch: refresh the EXISTING pending review projection in place, without
 -- creating a duplicate review task or changing approval state.
 update public.sanad_work_items
 set summary=coalesce(nullif(v_review->>'summary',''),'راجع تفاصيل الإجراء قبل اعتماده.'),
     updated_at=now()
 where recipient_user_id=v_uid
   and source_type='sanad_agent_action'
   and source_id=v_row.id::text
   and dedupe_key='agent_action_review:'||v_row.id::text
   and status in ('open','in_progress');

 return to_jsonb(v_row);
end;
$function$;

revoke all on function public.update_my_sanad_agent_action_note_v1(uuid,integer,text)
 from public,anon;
grant execute on function public.update_my_sanad_agent_action_note_v1(uuid,integer,text)
 to authenticated;
comment on function public.update_my_sanad_agent_action_note_v1(uuid,integer,text) is
 'Stage 2D.2-A: owner-only same-ID note edit with optimistic version, server review regeneration, immutable financial data and no ERP write.';
