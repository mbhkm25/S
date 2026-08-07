-- Harden financial-operation date/time extraction and storage.
-- Yemen-local document times are normalized to Asia/Aden before timestamptz storage.

create or replace function public.normalize_operation_local_datetime_to_aden()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_raw text;
  v_time_present boolean;
begin
  v_raw := coalesce(
    new.raw_ai_json #>> '{extracted,transaction_datetime}',
    new.structured_data ->> 'transaction_datetime'
  );

  v_time_present := coalesce(
    (new.raw_ai_json #>> '{extracted,transaction_time_present}')::boolean,
    (new.structured_data ->> 'transaction_time_present')::boolean,
    false
  );

  if v_time_present
     and v_raw is not null
     and v_raw ~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$'
  then
    new.transaction_datetime := (
      replace(v_raw, 'T', ' ')::timestamp at time zone 'Asia/Aden'
    );
  end if;

  return new;
exception
  when others then
    -- Never block operation persistence because of malformed AI output.
    return new;
end;
$$;

drop trigger if exists trg_normalize_operation_local_datetime_to_aden
  on public.operations;

create trigger trg_normalize_operation_local_datetime_to_aden
before insert or update of raw_ai_json, structured_data, transaction_datetime
on public.operations
for each row
execute function public.normalize_operation_local_datetime_to_aden();

update public.ai_prompts
set prompt_text = case
      when prompt_text like '%قواعد صارمة إضافية للتاريخ والوقت والمنطقة الزمنية:%'
        then prompt_text
      else prompt_text || E'\n\nقواعد صارمة إضافية للتاريخ والوقت والمنطقة الزمنية:\n- اعتبر جميع الأوقات الظاهرة في إشعارات المؤسسات المالية اليمنية أوقاتًا محلية بتوقيت اليمن Asia/Aden (UTC+03:00)، ما لم يظهر في المستند بوضوح توقيت مختلف.\n- إذا ظهر وقت صريح، يجب أن تكون transaction_datetime بصيغة ISO 8601 كاملة مع المنطقة الزمنية +03:00، مثال: 2026-07-27T20:41:00+03:00.\n- يمنع منعًا باتًا إرجاع وقت محلي دون offset، مثل 2026-07-27T20:41:00.\n- إذا ظهر الوقت بصيغة 12 ساعة، حوّله بدقة: 08:41 PM = 20:41:00، و08:41 AM = 08:41:00.\n- إذا لم يظهر وقت صريح، أعد التاريخ فقط بصيغة YYYY-MM-DD، واجعل transaction_time_present=false. لا تخترع 00:00 أو 03:00 أو أي وقت افتراضي.\n- transaction_time_present=true فقط عند وجود ساعة ودقيقة ظاهرتين صراحة في المستند.\n- transaction_date_source يجب أن يصف المصدر بدقة: labeled_date عند ارتباط التاريخ بكلمة التاريخ/Date، single_visible_date عند وجود تاريخ واحد غير مسمى، أو null إذا لم يوجد تاريخ.\n- عند وجود أكثر من تاريخ، اعتمد التاريخ المرتبط مباشرة بكلمة التاريخ أو Date. إذا كانت الصيغ المختلفة تشير إلى اليوم نفسه فلا تعتبرها تعارضًا.\n- طابق التاريخ والوقت حرفيًا مع المستند قبل إخراج JSON، ولا تعتمد زمن رفع الملف أو زمن النظام بدل زمن المستند.\n- إذا تعذر قراءة AM/PM بوضوح، لا تخمن؛ أعد التاريخ فقط واجعل transaction_time_present=false وأضف ai_flag باسم ambiguous_time_meridiem.\n'
    end,
    version = greatest(version, 3),
    is_active = true,
    notes = 'Strict date/time extraction: labeled-date priority, explicit Yemen timezone, no invented time, AM/PM validation.',
    updated_at = now()
where prompt_key = 'sanad_operation_extraction_v1';
