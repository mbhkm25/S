begin;

create or replace function private.dispatch_admin_campaign(p_campaign_id uuid,p_actor uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.sanad_admin_campaigns%rowtype;
  r record;
  v_notification jsonb;
  v_notification_count integer:=0;
  v_user_count integer:=0;
  v_wa_count integer:=0;
  v_eligible_wa integer:=0;
  v_wa_campaign uuid;
begin
  select * into v from public.sanad_admin_campaigns where id=p_campaign_id for update;
  if not found then raise exception 'admin_campaign_not_found'; end if;
  if v.status not in ('draft','scheduled') then
    return jsonb_build_object('ok',false,'reason','campaign_not_dispatchable','status',v.status);
  end if;

  update public.sanad_admin_campaigns set status='dispatching',dispatched_at=now(),last_error=null,updated_at=now() where id=v.id;

  for r in select user_id from private.admin_campaign_user_audience(v.audience_filter) loop
    insert into public.sanad_admin_campaign_recipients(campaign_id,user_id,channels,in_app_status)
    values(v.id,r.user_id,v.channels,case when ('in_app'=any(v.channels) or 'push'=any(v.channels)) then 'pending' else null end)
    on conflict(campaign_id,user_id) do nothing;
    v_user_count:=v_user_count+1;

    if 'in_app'=any(v.channels) or 'push'=any(v.channels) then
      v_notification:=private.create_notification(
        r.user_id,'system_announcement',v.category,v.severity,v.title,v.body,v.action_type,v.action_payload,
        p_actor,null,null,'admin_campaign',v.id::text,
        'admin_campaign:'||v.id::text||':'||r.user_id::text,
        jsonb_build_object('campaign_id',v.id,'channels',v.channels),null
      );
      update public.sanad_admin_campaign_recipients
      set notification_id=nullif(v_notification->>'notification_id','')::uuid,in_app_status='created',updated_at=now()
      where campaign_id=v.id and user_id=r.user_id;
      v_notification_count:=v_notification_count+case when coalesce((v_notification->>'created')::boolean,false) then 1 else 0 end;
    end if;
  end loop;

  if 'whatsapp'=any(v.channels) then
    select count(*) into v_eligible_wa from private.admin_campaign_whatsapp_audience(v.audience_filter);
    if v_eligible_wa=0 then
      update public.sanad_admin_campaigns
      set status=case when ('in_app'=any(v.channels) or 'push'=any(v.channels)) then 'completed' else 'failed' end,
          total_users=v_user_count,total_whatsapp=0,notification_count=v_notification_count,
          completed_at=now(),last_error='no_eligible_whatsapp_recipients',updated_at=now()
      where id=v.id;
      return jsonb_build_object('ok',('in_app'=any(v.channels) or 'push'=any(v.channels)),'campaign_id',v.id,
        'status',case when ('in_app'=any(v.channels) or 'push'=any(v.channels)) then 'completed' else 'failed' end,
        'users',v_user_count,'notifications',v_notification_count,'whatsapp',0,'warning','no_eligible_whatsapp_recipients');
    end if;

    insert into public.sanad_whatsapp_campaigns(
      name,purpose,template_name,template_language,template_parameters,audience_filter,status,
      created_by,queued_by,admin_reason,queued_at
    ) values(
      v.name,'service_update',v.whatsapp_template_name,v.whatsapp_template_language,
      v.whatsapp_template_parameters,v.audience_filter,'queued',v.created_by,
      coalesce(p_actor,v.created_by),coalesce(v.admin_reason,'حملة متعددة القنوات'),now()
    ) returning id into v_wa_campaign;

    for r in select contact_id from private.admin_campaign_whatsapp_audience(v.audience_filter) loop
      insert into public.sanad_admin_campaign_recipients(campaign_id,user_id,whatsapp_contact_id,channels,whatsapp_status)
      values(v.id,null,r.contact_id,v.channels,'pending')
      on conflict(campaign_id,whatsapp_contact_id) do nothing;

      insert into public.sanad_whatsapp_campaign_recipients(campaign_id,contact_id,phone_normalized)
      select v_wa_campaign,c.id,c.phone_normalized from public.sanad_whatsapp_contacts c where c.id=r.contact_id
      on conflict(campaign_id,contact_id) do nothing;
      v_wa_count:=v_wa_count+1;
    end loop;

    update public.sanad_whatsapp_campaigns
    set total_recipients=v_wa_count,pending_count=v_wa_count,updated_at=now()
    where id=v_wa_campaign;
  end if;

  update public.sanad_admin_campaigns
  set status=case when v_wa_campaign is null then 'completed' else 'queued' end,
      total_users=v_user_count,total_whatsapp=v_wa_count,notification_count=v_notification_count,
      whatsapp_campaign_id=v_wa_campaign,
      completed_at=case when v_wa_campaign is null then now() else null end,
      updated_at=now()
  where id=v.id;

  return jsonb_build_object('ok',true,'campaign_id',v.id,
    'status',case when v_wa_campaign is null then 'completed' else 'queued' end,
    'users',v_user_count,'notifications',v_notification_count,'whatsapp',v_wa_count,
    'whatsapp_campaign_id',v_wa_campaign);
end;
$$;

commit;
