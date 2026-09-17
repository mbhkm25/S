create or replace function public.business_commercial_document_guard_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  if new.party_id is not null and not exists (
    select 1 from public.business_parties p
    where p.id=new.party_id and p.business_id=new.business_id
  ) then
    raise exception 'party_business_mismatch';
  end if;

  if tg_op='UPDATE' and old.status='posted' then
    if new.business_id is distinct from old.business_id
       or new.party_id is distinct from old.party_id
       or new.document_type is distinct from old.document_type
       or new.document_number is distinct from old.document_number
       or new.document_date is distinct from old.document_date
       or new.due_date is distinct from old.due_date
       or new.currency is distinct from old.currency
       or new.subtotal is distinct from old.subtotal
       or new.discount_amount is distinct from old.discount_amount
       or new.tax_amount is distinct from old.tax_amount
       or new.total_amount is distinct from old.total_amount then
      raise exception 'posted_document_financial_fields_are_immutable';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_business_commercial_document_guard_v1 on public.business_commercial_documents;
create trigger trg_business_commercial_document_guard_v1
before insert or update on public.business_commercial_documents
for each row execute function public.business_commercial_document_guard_v1();

create or replace function public.business_commercial_line_guard_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
declare
  v_document_business uuid;
  v_document_status text;
begin
  select d.business_id,d.status into v_document_business,v_document_status
  from public.business_commercial_documents d
  where d.id=coalesce(new.document_id,old.document_id);

  if v_document_business is null then
    raise exception 'commercial_document_not_found';
  end if;
  if v_document_status <> 'draft' then
    raise exception 'commercial_document_lines_are_immutable_after_posting';
  end if;
  if tg_op <> 'DELETE' and new.business_id <> v_document_business then
    raise exception 'document_line_business_mismatch';
  end if;
  if tg_op <> 'DELETE' and new.item_id is not null and not exists (
    select 1 from public.business_catalog_items i
    where i.id=new.item_id and i.business_id=new.business_id
  ) then
    raise exception 'catalog_item_business_mismatch';
  end if;

  return coalesce(new,old);
end;
$function$;

drop trigger if exists trg_business_commercial_line_guard_v1 on public.business_commercial_document_lines;
create trigger trg_business_commercial_line_guard_v1
before insert or update or delete on public.business_commercial_document_lines
for each row execute function public.business_commercial_line_guard_v1();

create or replace function public.create_business_commercial_draft_v1(p_command jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_business uuid;
  v_party uuid;
  v_type text := lower(btrim(coalesce(p_command->>'document_type','')));
  v_currency text := upper(btrim(coalesce(p_command->>'currency','')));
  v_number text := nullif(btrim(coalesce(p_command->>'document_number','')),'');
  v_date date := coalesce(nullif(p_command->>'document_date','')::date,current_date);
  v_due date := nullif(p_command->>'due_date','')::date;
  v_notes text := nullif(btrim(coalesce(p_command->>'notes','')),'');
  v_document uuid;
  v_line jsonb;
  v_item uuid;
  v_description text;
  v_quantity numeric(24,6);
  v_unit_price numeric(24,6);
  v_discount numeric(24,6);
  v_tax numeric(24,6);
  v_line_total numeric(24,6);
  v_subtotal numeric(24,6) := 0;
  v_discount_total numeric(24,6) := 0;
  v_tax_total numeric(24,6) := 0;
  v_total numeric(24,6) := 0;
  v_count integer := 0;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  begin v_business := nullif(p_command->>'business_id','')::uuid; exception when others then raise exception 'invalid_business_id'; end;
  begin v_party := nullif(p_command->>'party_id','')::uuid; exception when others then raise exception 'invalid_party_id'; end;
  if v_business is null then raise exception 'business_id_required'; end if;
  if not private.user_is_business_owner(v_business,v_user) then raise exception 'business_owner_required'; end if;
  if v_type not in ('quotation','sales_invoice','purchase_invoice','receipt','payment','expense') then raise exception 'invalid_document_type'; end if;
  if v_currency !~ '^[A-Z]{3}$' then raise exception 'invalid_currency'; end if;
  if v_due is not null and v_due < v_date then raise exception 'invalid_due_date'; end if;
  if jsonb_typeof(coalesce(p_command->'lines','null'::jsonb)) <> 'array' then raise exception 'lines_array_required'; end if;
  if jsonb_array_length(p_command->'lines') < 1 then raise exception 'at_least_one_line_required'; end if;

  insert into public.business_commercial_documents(
    business_id,party_id,document_type,document_number,document_date,due_date,currency,
    subtotal,discount_amount,tax_amount,total_amount,paid_amount,status,payment_status,notes,metadata,created_by_user_id
  ) values (
    v_business,v_party,v_type,v_number,v_date,v_due,v_currency,
    0,0,0,0,0,'draft',case when v_type in ('quotation','receipt','payment') then 'not_applicable' else 'unpaid' end,
    v_notes,coalesce(p_command->'metadata','{}'::jsonb),v_user
  ) returning id into v_document;

  for v_line in select value from jsonb_array_elements(p_command->'lines') loop
    begin v_item := nullif(v_line->>'item_id','')::uuid; exception when others then raise exception 'invalid_item_id'; end;
    v_description := nullif(btrim(coalesce(v_line->>'description','')),'');
    if v_description is null and v_item is not null then
      select i.title into v_description from public.business_catalog_items i where i.id=v_item and i.business_id=v_business;
    end if;
    if v_description is null then raise exception 'line_description_required'; end if;
    begin v_quantity := coalesce(nullif(v_line->>'quantity','')::numeric,1); exception when others then raise exception 'invalid_line_quantity'; end;
    begin v_unit_price := coalesce(nullif(v_line->>'unit_price','')::numeric,0); exception when others then raise exception 'invalid_line_unit_price'; end;
    begin v_discount := coalesce(nullif(v_line->>'discount_amount','')::numeric,0); exception when others then raise exception 'invalid_line_discount'; end;
    begin v_tax := coalesce(nullif(v_line->>'tax_amount','')::numeric,0); exception when others then raise exception 'invalid_line_tax'; end;
    if v_quantity <= 0 or v_unit_price < 0 or v_discount < 0 or v_tax < 0 then raise exception 'invalid_line_amounts'; end if;
    if v_discount > (v_quantity*v_unit_price) then raise exception 'line_discount_exceeds_gross'; end if;
    v_line_total := (v_quantity*v_unit_price)-v_discount+v_tax;

    insert into public.business_commercial_document_lines(
      document_id,business_id,item_id,description,quantity,unit_price,discount_amount,tax_amount,line_total,sort_order,metadata
    ) values (
      v_document,v_business,v_item,v_description,v_quantity,v_unit_price,v_discount,v_tax,v_line_total,v_count,coalesce(v_line->'metadata','{}'::jsonb)
    );

    v_subtotal := v_subtotal + (v_quantity*v_unit_price);
    v_discount_total := v_discount_total + v_discount;
    v_tax_total := v_tax_total + v_tax;
    v_total := v_total + v_line_total;
    v_count := v_count + 1;
  end loop;

  update public.business_commercial_documents
  set subtotal=v_subtotal,discount_amount=v_discount_total,tax_amount=v_tax_total,total_amount=v_total,updated_at=now()
  where id=v_document and business_id=v_business;

  return jsonb_build_object(
    'contract_version',1,
    'document_id',v_document,
    'status','draft',
    'document_type',v_type,
    'currency',v_currency,
    'subtotal',v_subtotal,
    'discount_amount',v_discount_total,
    'tax_amount',v_tax_total,
    'total_amount',v_total,
    'line_count',v_count
  );
end;
$function$;

revoke all on function public.create_business_commercial_draft_v1(jsonb) from public;
grant execute on function public.create_business_commercial_draft_v1(jsonb) to authenticated;

create or replace function public.post_business_commercial_document_v1(p_document_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_doc public.business_commercial_documents%rowtype;
  v_subtotal numeric(24,6);
  v_discount numeric(24,6);
  v_tax numeric(24,6);
  v_total numeric(24,6);
  v_entry_type text;
  v_ledger_id uuid;
begin
  if v_user is null then raise exception 'authentication_required'; end if;

  select * into v_doc
  from public.business_commercial_documents d
  where d.id=p_document_id
  for update;

  if v_doc.id is null then raise exception 'commercial_document_not_found'; end if;
  if not private.user_is_business_owner(v_doc.business_id,v_user) then raise exception 'business_owner_required'; end if;
  if v_doc.status='posted' then
    return jsonb_build_object('contract_version',1,'document_id',v_doc.id,'status','posted','already_posted',true,'total_amount',v_doc.total_amount,'currency',v_doc.currency);
  end if;
  if v_doc.status <> 'draft' then raise exception 'only_draft_document_can_be_posted'; end if;
  if not exists (select 1 from public.business_commercial_document_lines l where l.document_id=v_doc.id) then raise exception 'document_has_no_lines'; end if;

  select coalesce(sum(l.quantity*l.unit_price),0),coalesce(sum(l.discount_amount),0),coalesce(sum(l.tax_amount),0),coalesce(sum(l.line_total),0)
  into v_subtotal,v_discount,v_tax,v_total
  from public.business_commercial_document_lines l
  where l.document_id=v_doc.id and l.business_id=v_doc.business_id;

  if v_total < 0 then raise exception 'invalid_document_total'; end if;

  update public.business_commercial_documents
  set subtotal=v_subtotal,discount_amount=v_discount,tax_amount=v_tax,total_amount=v_total,
      status='posted',posted_at=now(),updated_at=now(),
      payment_status=case when document_type in ('quotation','receipt','payment') then 'not_applicable' else payment_status end
  where id=v_doc.id;

  if v_doc.party_id is not null and v_doc.document_type <> 'quotation' and v_total > 0 then
    v_entry_type := case
      when v_doc.document_type in ('sales_invoice','payment') then 'debit'
      when v_doc.document_type in ('purchase_invoice','receipt','expense') then 'credit'
      else null
    end;

    if v_entry_type is not null then
      insert into public.business_party_ledger_entries(
        business_id,party_id,source_document_id,entry_type,amount,currency,occurred_at,description,status,metadata,created_by_user_id
      ) values (
        v_doc.business_id,v_doc.party_id,v_doc.id,v_entry_type,v_total,v_doc.currency,
        v_doc.document_date::timestamptz,
        coalesce(v_doc.document_number,v_doc.document_type),
        'active',jsonb_build_object('document_type',v_doc.document_type,'contract_version',1),v_user
      )
      on conflict (source_document_id,entry_type) where source_document_id is not null and status='active'
      do nothing
      returning id into v_ledger_id;
    end if;
  end if;

  return jsonb_build_object(
    'contract_version',1,
    'document_id',v_doc.id,
    'status','posted',
    'already_posted',false,
    'subtotal',v_subtotal,
    'discount_amount',v_discount,
    'tax_amount',v_tax,
    'total_amount',v_total,
    'currency',v_doc.currency,
    'ledger_entry_id',v_ledger_id
  );
end;
$function$;

revoke all on function public.post_business_commercial_document_v1(uuid) from public;
grant execute on function public.post_business_commercial_document_v1(uuid) to authenticated;
