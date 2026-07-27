-- Enforce Yemen-local timestamps for AI-extracted financial notice times.

create or replace function public.enforce_sanad_operation_datetime()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_raw_datetime text;
  v_time_present boolean;
  v_date_source text;
  v_normalized_datetime text;
begin
  v_raw_datetime := coalesce(
    new.raw_ai_json #>> '{extracted,transaction_datetime}',
    new.structured_data ->> 'transaction_datetime'
  );

  begin
    v_time_present := coalesce(
      (new.raw_ai_json #>> '{extracted,transaction_time_present}')::boolean,
      (new.structured_data ->> 'transaction_time_present')::boolean,
      false
    );
  exception when others then
    v_time_present := false;
  end;

  v_date_source := coalesce(
    new.raw_ai_json #>> '{extracted,transaction_date_source}',
    new.structured_data ->> 'transaction_date_source'
  );

  if v_raw_datetime is null or btrim(v_raw_datetime) = '' then
    return new;
  end if;

  if v_time_present then
    if v_raw_datetime ~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?([+-]\d{2}:?\d{2}|Z)$' then
      new.transaction_datetime := v_raw_datetime::timestamptz;
      v_normalized_datetime := to_char(
        new.transaction_datetime at time zone 'Asia/Aden',
        'YYYY-MM-DD"T"HH24:MI:SS'
      ) || '+03:00';
    elsif v_raw_datetime ~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$' then
      new.transaction_datetime := replace(v_raw_datetime, 'T', ' ')::timestamp at time zone 'Asia/Aden';
      v_normalized_datetime := replace(v_raw_datetime, ' ', 'T');
      if length(v_normalized_datetime) = 16 then
        v_normalized_datetime := v_normalized_datetime || ':00';
      end if;
      v_normalized_datetime := v_normalized_datetime || '+03:00';
    else
      return new;
    end if;

    new.structured_data := jsonb_set(
      jsonb_set(
        jsonb_set(
          coalesce(new.structured_data, '{}'::jsonb),
          '{transaction_datetime}',
          to_jsonb(v_normalized_datetime),
          true
        ),
        '{transaction_time_present}',
        'true'::jsonb,
        true
      ),
      '{transaction_date_source}',
      to_jsonb(coalesce(v_date_source, 'document_time')),
      true
    );

    new.raw_ai_json := jsonb_set(
      jsonb_set(
        jsonb_set(
          coalesce(new.raw_ai_json, '{}'::jsonb),
          '{normalized,transaction_datetime}',
          to_jsonb(v_normalized_datetime),
          true
        ),
        '{normalized,transaction_time_present}',
        'true'::jsonb,
        true
      ),
      '{normalized,transaction_date_source}',
      to_jsonb(coalesce(v_date_source, 'document_time')),
      true
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_sanad_operation_datetime on public.operations;
create trigger trg_enforce_sanad_operation_datetime
before insert or update of raw_ai_json, structured_data, transaction_datetime
on public.operations
for each row
execute function public.enforce_sanad_operation_datetime();

revoke all on function public.enforce_sanad_operation_datetime() from public;
grant execute on function public.enforce_sanad_operation_datetime() to service_role;

update public.ai_prompts
set prompt_text = prompt_text || E'\n\nقواعد إلزامية صارمة للتاريخ والوقت والمنطقة الزمنية:\n- استخرج التاريخ والوقت كما يظهران حرفيًا في المستند، ولا تخترع وقتًا أو منطقة زمنية.\n- إذا ظهر تاريخ واحد فقط، استخدمه حتى لو لم تكن بجانبه كلمة التاريخ.\n- إذا ظهرت عدة تواريخ، اختر التاريخ المرتبط مباشرة بكلمة التاريخ أو Date.\n- إذا كانت التواريخ المتعددة تمثل اليوم نفسه بصيغ مختلفة، فلا تعتبرها تعارضًا.\n- إذا ظهر وقت صريح بجانب تاريخ العملية أو في سطر التذييل الخاص بالإشعار، اجعله وقت العملية واضبط transaction_time_present=true.\n- إذا لم يظهر وقت صريح، أعد التاريخ فقط بصيغة YYYY-MM-DD واضبط transaction_time_present=false.\n- عند وجود وقت صريح في إشعار يمني بلا منطقة زمنية مكتوبة، أعد transaction_datetime بصيغة ISO مع توقيت اليمن +03:00.\n- لا تعد وقتًا محليًا بلا offset، ولا تستخدم Z أو UTC إلا إذا كان ذلك مكتوبًا صراحة في المستند.\n- لا تحول 08:41 PM إلى 08:41؛ يجب تحويلها إلى 20:41 مع +03:00.\n- إذا تعذر حسم التاريخ أو الوقت بدقة، اجعل الحقل null وأضف علمًا واضحًا في ai_flags بدل التخمين.\n- قبل إخراج JSON، راجع منطقيًا أن التاريخ والوقت والمبلغ والعملة والمرجع والأسماء والحسابات متطابقة مع النص الظاهر في المستند.\n',
    version = greatest(version, 3),
    is_active = true,
    notes = 'Strict datetime extraction and Yemen timezone normalization; no invented time; labeled-date precedence.',
    updated_at = now()
where prompt_key = 'sanad_operation_extraction_v1'
  and position('قواعد إلزامية صارمة للتاريخ والوقت والمنطقة الزمنية' in prompt_text) = 0;