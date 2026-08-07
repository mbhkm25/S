begin;

update public.subscription_plans
set description='30 عملية تحقق تأسيسية لمرة واحدة طوال عمر الحساب.'
where code='free';

revoke all on function public.open_operation_access(uuid,text) from public,anon;
grant execute on function public.open_operation_access(uuid,text) to authenticated,service_role;

drop policy if exists storage_delete_pro_payment_receipts on storage.objects;
create policy storage_delete_pro_payment_receipts on storage.objects
for delete to authenticated
using (
  bucket_id='operation-files'
  and (storage.foldername(name))[1]='pro-payment-receipts'
  and (storage.foldername(name))[2]=(select auth.uid())::text
);

create or replace function public.sanad_pro_payment_notification()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_type text; v_title text; v_body text; v_severity text:='info';
begin
  if tg_op='INSERT' then
    v_type:='pro_payment_submitted'; v_title:='تم استلام طلب سند Pro';
    v_body:='طلبك قيد التحقق، وستظهر النتيجة في إدارة الاشتراك.';
  elsif new.status is distinct from old.status and new.status in ('approved','auto_approved') then
    v_type:='pro_payment_approved'; v_title:='تم تفعيل سند Pro';
    v_body:='أصبح اشتراكك جاهزًا للاستخدام.'; v_severity:='success';
  elsif new.status is distinct from old.status and new.status='rejected' then
    v_type:='pro_payment_rejected'; v_title:='تعذر اعتماد طلب سند Pro';
    v_body:='راجع حالة الطلب أو تواصل مع الدعم.'; v_severity:='warning';
  else return new; end if;
  insert into public.notifications(recipient_user_id,notification_type,category,severity,title,body,
    action_type,action_payload,source_event_type,source_event_id,dedupe_key,data)
  values(new.user_id,v_type,'pro_payment',v_severity,v_title,v_body,'profile',
    jsonb_build_object('section','subscription'),'pro_payment_request',new.id::text,
    v_type||':'||new.id::text,jsonb_build_object('payment_request_id',new.id,'status',new.status))
  on conflict(recipient_user_id,dedupe_key) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_sanad_pro_payment_notification on public.pro_payment_requests;
create trigger trg_sanad_pro_payment_notification after insert or update of status
on public.pro_payment_requests for each row execute function public.sanad_pro_payment_notification();

create extension if not exists pg_cron with schema extensions;

create or replace function public.process_sanad_subscription_lifecycle()
returns void language plpgsql security definer set search_path='' as $$
begin
  insert into public.notifications(recipient_user_id,notification_type,category,severity,title,body,
    action_type,action_payload,source_event_type,source_event_id,dedupe_key,data)
  select s.user_id,'subscription_expiring','pro_payment','warning','اشتراك سند Pro يقترب من الانتهاء',
    'تبقى أقل من ثلاثة أيام على انتهاء الاشتراك.','profile',jsonb_build_object('section','subscription'),
    'user_subscription',s.id::text,'subscription_expiring:'||s.id::text,
    jsonb_build_object('subscription_id',s.id,'ends_at',s.current_period_end)
  from public.user_subscriptions s
  where s.status='active' and s.current_period_end>now() and s.current_period_end<=now()+interval '3 days'
  on conflict(recipient_user_id,dedupe_key) do nothing;

  update public.user_subscriptions set status='expired',updated_at=now()
  where status='active' and current_period_end<=now();
  update public.user_subscriptions set status='active',updated_at=now()
  where status='scheduled' and current_period_start<=now() and current_period_end>now();

  insert into public.notifications(recipient_user_id,notification_type,category,severity,title,body,
    action_type,action_payload,source_event_type,source_event_id,dedupe_key,data)
  select s.user_id,'subscription_expired','pro_payment','warning','انتهى اشتراك سند Pro',
    'يمكنك التجديد من إدارة الاشتراك.','profile',jsonb_build_object('section','subscription'),
    'user_subscription',s.id::text,'subscription_expired:'||s.id::text,
    jsonb_build_object('subscription_id',s.id,'ended_at',s.current_period_end)
  from public.user_subscriptions s where s.status='expired' and s.current_period_end<=now()
  on conflict(recipient_user_id,dedupe_key) do nothing;

  update public.pro_payment_requests set status='pending_review',failure_reason='processing_timeout',updated_at=now()
  where status='processing' and updated_at<now()-interval '15 minutes';
end;
$$;

revoke all on function public.process_sanad_subscription_lifecycle() from public,anon,authenticated;
grant execute on function public.process_sanad_subscription_lifecycle() to service_role;

select cron.unschedule(jobid) from cron.job where jobname='sanad-subscription-lifecycle';
select cron.schedule('sanad-subscription-lifecycle','*/15 * * * *',$$select public.process_sanad_subscription_lifecycle();$$);

commit;
