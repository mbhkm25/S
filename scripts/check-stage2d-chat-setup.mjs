// Isolated PostgreSQL runtime tests. Never connects to Supabase or any real ledger.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';

const read = name => readFileSync(`supabase/migrations/${name}`, 'utf8');
const migration = readdirSync('supabase/migrations').find(n => n.endsWith('_stage2d_personal_expense_draft_edit_v1.sql'));
assert.ok(migration);
// CI-only real PostgreSQL mode has a fixed loopback disposable database.
// Deliberately accepts no production URL, host or credentials from the caller.
const postgresMode = process.env.SANAD_TEST_POSTGRES === '1';
const config = {host:'127.0.0.1',port:5432,user:'postgres',password:'sanad_test',database:'sanad_setup_test'};
const client = postgresMode ? new pg.Client(config) : null;
if (client) await client.connect();
const db = client ? {query:(...args)=>client.query(...args),exec:s=>client.query(s),close:()=>client.end()} : new PGlite();
const uid = '10000000-0000-0000-0000-000000000001';
const foreign = '10000000-0000-0000-0000-000000000002';
const thread = '20000000-0000-0000-0000-000000000001';
const businessThread = '20000000-0000-0000-0000-000000000002';
const business = '30000000-0000-0000-0000-000000000001';
const account = '40000000-0000-0000-0000-000000000001';
const foreignAccount = '40000000-0000-0000-0000-000000000002';
const otherAccount = '40000000-0000-0000-0000-000000000003';
const category = '50000000-0000-0000-0000-000000000001';
const attachment = '60000000-0000-0000-0000-000000000001';
let checks = 0;
async function denied(sql, params, pattern) {
  await assert.rejects(db.query(sql, params), pattern); checks++;
}
async function scalar(sql, params = []) { return (await db.query(sql, params)).rows[0].value; }
const payload = { transaction_type: 'expense', amount: '12.500001', currency: 'SAR', account_id: account,
  category_id: category, description: 'اختبار اصطناعي', transaction_at: '2026-09-27T09:30:00+03:00' };
const create = (p = payload, t = thread, type = 'personal_transaction', attachments = [attachment]) => scalar(
  'select public.create_my_sanad_agent_action_draft_v1($1,$2,$3,null,null,$4::uuid[]) as value', [t,type,p,attachments]);
const edit = (id, version, p) => scalar('select public.update_my_sanad_agent_action_draft_v2($1,$2,$3) as value', [id,version,p]);
const rejectEdit = (id, version, p, pattern) => denied('select public.update_my_sanad_agent_action_draft_v2($1,$2,$3)',[id,version,p],pattern);
try {
  // Narrow dependency fixture. Actions, origin guard, Work Items, domain events,
  // projection and tested RPCs below are loaded from the real migrations.
  await db.exec(`
    do $$ begin
      if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
    end $$;
    create schema auth; create schema private;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon;
    create table public.profiles(id uuid primary key,status text);
    create table public.business_profiles(id uuid primary key,user_id uuid);
    create function private.user_is_business_owner(b uuid,u uuid) returns boolean language sql as
      $$select exists(select 1 from public.business_profiles where id=b and user_id=u)$$;
    create table public.sanad_agent_threads(id uuid primary key,user_id uuid,status text,project_kind text,business_id uuid);
    create table public.sanad_agent_attachments(id uuid primary key,user_id uuid,thread_id uuid,status text);
    create table public.personal_finance_accounts(id uuid primary key,user_id uuid,name text,currency text,status text,system_role text);
    create table public.personal_finance_categories(id uuid primary key,user_id uuid,name text,kind text,status text);
    create table public.business_parties(id uuid primary key,business_id uuid,display_name text,status text);
    -- Execution tripwire: no real transaction implementation is present in this fixture.
    create table public.test_execution_calls(payload jsonb);
    create function public.create_personal_finance_transaction_v1(p jsonb) returns jsonb language plpgsql as
      $$begin insert into public.test_execution_calls values(p); return '{"transaction_id":"synthetic"}'::jsonb; end$$;
    create function public.create_business_commercial_draft_v1(p jsonb) returns jsonb language plpgsql as
      $$begin raise exception 'business execution forbidden in fixture'; end$$;
    insert into auth.users values('${uid}'),('${foreign}');
    insert into public.profiles values('${uid}','active'),('${foreign}','active');
    insert into public.business_profiles values('${business}','${uid}');
    insert into public.sanad_agent_threads values
      ('${thread}','${uid}','active','personal',null),
      ('${businessThread}','${uid}','active','business','${business}');
    insert into public.personal_finance_accounts values
      ('${account}','${uid}','حساب ريال سعودي','SAR','active',null),
      ('${foreignAccount}','${foreign}','حساب آخر','SAR','active',null),
      ('${otherAccount}','${uid}','حساب ريال يمني','YER','active',null);
    insert into public.personal_finance_categories values('${category}','${uid}','نقل','expense','active');
    insert into public.sanad_agent_attachments values('${attachment}','${uid}','${thread}','ready');
  `);
  await db.exec(read('20260920121815_sanad_agent_actions_v1.sql'));
  await db.exec(read('20260923163515_stage2b_domain_events_work_items_v1.sql').split('create or replace function public.list_my_sanad_work_items_v1')[0]);
  const projection = read('20260923163526_stage2b_work_projection_resilience_v1.sql');
  await db.exec('create or replace function private.project_sanad_agent_action_event_to_work_v1()'+
    projection.split('create or replace function private.project_sanad_agent_action_event_to_work_v1()')[1].split('$function$;')[0]+'$function$;');
  await db.exec(`create trigger sanad_agent_action_event_work_projection_v1 after insert on public.sanad_agent_action_events
    for each row execute function private.project_sanad_agent_action_event_to_work_v1();`);
  await db.exec(read('20260926214052_stage2d_action_origin_scope_guard_v1.sql'));
  await db.exec(read('20260926222117_stage2d_same_action_note_edit_v1.sql'));
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
  await db.exec('set role authenticated');
  await db.exec('reset role');
  await db.exec(`
    alter table public.personal_finance_accounts alter column id set default gen_random_uuid();
    alter table public.personal_finance_accounts alter column status set default 'active';
    alter table public.personal_finance_accounts add column account_type text default 'asset';
    alter table public.personal_finance_accounts add column linked_user_financial_account_id uuid;
    alter table public.personal_finance_accounts add column metadata jsonb;
    alter table public.personal_finance_categories alter column id set default gen_random_uuid();
    alter table public.personal_finance_categories alter column status set default 'active';
    alter table public.personal_finance_categories add column parent_id uuid;
    create table public.user_financial_accounts(id uuid,user_id uuid,status text);
  `);
  // Execute actual account/category domain commands, not mocks. Any opening-balance
  // ledger path fails because ledger tables are deliberately absent in this database.
  const domain = read('20260916185208_personal_finance_contracts_v1.sql');
  for (const name of ['category','account']) {
    const fn = 'create or replace function public.create_personal_finance_'+name+'_v1';
    await db.exec(fn+domain.split(fn)[1].split('$$;')[0]+'$$;');
  }
  await db.exec(read(migration));
  await db.exec(read('20260927075434_stage2d_personal_expense_editor_capability_v1.sql'));
  await db.exec(read('20260927130000_stage2d_chat_personal_setup_v1.sql'));
  await db.exec('set role authenticated');
  const approve = (a,version=a.version) => scalar('select public.approve_my_sanad_agent_action_v1($1,$2) value',[a.id,version]);
  const setup = (p,t='personal_account_setup',th=thread) => create(p,th,t,[]);
  const accountPayload = {name:'  محفظة   كاش  ',currency:'yer'};
  const a = await setup(accountPayload);
  assert.equal(a.status,'review'); assert.equal(a.payload.name,'محفظة كاش');
  assert.deepEqual(a.payload,{name:'محفظة كاش',currency:'YER'}); checks+=3;
  await db.exec('reset role');
  assert.equal(await scalar('select count(*)::integer value from public.personal_finance_accounts where name=$1',['محفظة كاش']),0); checks++;
  assert.equal(await scalar('select count(*)::integer value from public.sanad_work_items where source_id=$1',[a.id]),1); checks++;
  await db.exec('set role authenticated');
  assert.equal((await setup(accountPayload)).id,a.id); checks++;
  for(const extra of ['opening_balance','account_type','user_id','business_id','metadata','linked_user_financial_account_id','parent_id','kind']) {
    await denied('select public.create_my_sanad_agent_action_draft_v1($1,$2,$3)',[thread,'personal_account_setup',{...accountPayload,[extra]:'injected'}],/setup_payload_field_not_allowed/);
  }
  for(const bad of [{name:'',currency:'YER'},{name:42,currency:'YER'},{name:'a'.repeat(121),currency:'YER'}, {name:'test'}, {name:'test',currency:'ريال'}, {name:'test',currency:null}]) {
    await denied('select public.create_my_sanad_agent_action_draft_v1($1,$2,$3)',[thread,'personal_account_setup',bad],/setup_name|invalid_action_currency/);
  }
  await denied('select public.create_my_sanad_agent_action_draft_v1($1,$2,$3)',[businessThread,'personal_account_setup',accountPayload],/personal_project_required/);
  await denied('select public.approve_my_sanad_agent_action_v1($1,null)',[a.id],/valid_expected_version_required/);
  await denied('select public.approve_my_sanad_agent_action_v1($1,42)',[a.id],/version_conflict/);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[foreign]);
  await denied('select public.approve_my_sanad_agent_action_v1($1,1)',[a.id],/not_found/);
  await denied('select public.create_my_sanad_agent_action_draft_v1($1,$2,$3)',[thread,'personal_category_setup',{name:'test',kind:'expense'}],/thread_not_found/);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
  const done=await approve(a); assert.equal(done.status,'completed'); assert.ok(done.result.account_id); assert.equal(done.result.opening_balance,0); checks+=3;
  assert.deepEqual(await approve(a),done); checks++;
  const duplicate=await setup({name:'محفظة كاش',currency:'YER'});
  const failed=await approve(duplicate); assert.equal(failed.status,'failed'); assert.match(failed.error_code,/already_exists/); checks+=2;
  const categoryAction=await setup({name:'وقود',kind:'expense'},'personal_category_setup');
  const categoryDone=await approve(categoryAction); assert.equal(categoryDone.status,'completed'); assert.ok(categoryDone.result.category_id); checks+=2;
  const expense=await create({...payload,currency:'YER',account_id:done.result.account_id,category_id:categoryDone.result.category_id},thread,'personal_transaction',[]);
  assert.equal(expense.status,'review'); assert.equal(expense.payload.account_id,done.result.account_id); checks+=2;
  const revised=await edit(expense.id,expense.version,{transaction_type:'expense',amount:'15',currency:'YER',account_id:done.result.account_id,category_id:categoryDone.result.category_id,description:'متابعة',transaction_at:payload.transaction_at});
  assert.equal(revised.id,expense.id); assert.equal(revised.version,expense.version+1); checks+=2;
  for(const bad of [{name:'a',kind:'asset'}, {name:'a',kind:null}, {name:'a'.repeat(81),kind:'expense'}, {name:'a',kind:'expense',parent_id:category}, {name:'a',kind:'expense',currency:'SAR'}]) {
    await denied('select public.create_my_sanad_agent_action_draft_v1($1,$2,$3)',[thread,'personal_category_setup',bad],/invalid_setup|setup_payload_field_not_allowed/);
  }
  const catDuplicate=await setup({name:'وقود',kind:'expense'},'personal_category_setup');
  assert.equal((await approve(catDuplicate)).status,'failed'); checks++;
  const income=await setup({name:'وقود',kind:'income'},'personal_category_setup');
  assert.equal((await approve(income)).status,'completed'); checks++;
  const cancelled=await setup({name:'ملغى',currency:'SAR'});
  await scalar('select public.cancel_my_sanad_agent_action_v1($1,$2) value',[cancelled.id,cancelled.version]);
  await denied('select public.approve_my_sanad_agent_action_v1($1,1)',[cancelled.id],/not_approvable/);
  const archived=await setup({name:'مؤرشف',currency:'SAR'});
  await db.exec('reset role'); await db.query("update public.sanad_agent_threads set status='archived' where id=$1",[thread]); await db.exec('set role authenticated');
  assert.equal((await approve(archived)).status,'failed'); checks++;
  await denied('select public.create_my_sanad_agent_action_draft_v1($1,$2,$3)',[thread,'personal_account_setup',accountPayload],/thread_not_found/);
  await db.exec('reset role'); await db.query("update public.sanad_agent_threads set status='active' where id=$1",[thread]); await db.exec('set role authenticated');
  const caps=await scalar('select public.get_my_sanad_action_capabilities_v1($1) value',[thread]);
  assert.equal(caps.actions.filter(x=>x.action_type.endsWith('_setup')).length,2); checks++;
  const bizCaps=await scalar('select public.get_my_sanad_action_capabilities_v1($1) value',[businessThread]);
  assert.equal(bizCaps.actions.some(x=>x.action_type.endsWith('_setup')),false); checks++;
  await db.exec('reset role');
  assert.equal(await scalar('select count(*)::integer value from public.test_execution_calls'),0); checks++;
  assert.equal(await scalar("select count(*)::integer value from public.personal_finance_accounts where name='محفظة كاش'"),1); checks++;
  assert.equal(await scalar("select has_function_privilege('authenticated','private.execute_sanad_personal_setup_v1(text,jsonb)','execute') value"),false); checks++;
  assert.equal(await scalar("select has_function_privilege('anon','public.approve_my_sanad_agent_action_v1(uuid,integer)','execute') value"),false); checks++;
  if(postgresMode) {
    // Two independent transactions/threads attempt the same prerequisite concurrently.
    const secondThread='20000000-0000-0000-0000-000000000009';
    await db.query("insert into public.sanad_agent_threads values($1,$2,'active','personal',null)",[secondThread,uid]);
    await db.exec('set role authenticated');
    const raceA=await setup({name:'concurrent-wallet',currency:'SAR'});
    const raceB=await setup({name:'concurrent-wallet',currency:'SAR'},'personal_account_setup',secondThread);
    const peer=new pg.Client(config); await peer.connect();
    try {
      await peer.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]); await peer.query('set role authenticated');
      const results=await Promise.all([approve(raceA),peer.query('select public.approve_my_sanad_agent_action_v1($1,$2) value',[raceB.id,raceB.version]).then(r=>r.rows[0].value)]);
      assert.deepEqual(results.map(r=>r.status).sort(),['completed','failed']); checks++;
      await db.exec('reset role');
      assert.equal(await scalar("select count(*)::integer value from public.personal_finance_accounts where name='concurrent-wallet'"),1); checks++;
    } finally { await peer.end(); }
  }
  await db.query("select set_config('request.jwt.claim.sub','',false)"); await db.exec('set role authenticated');
  await denied('select public.create_my_sanad_agent_action_draft_v1($1,$2,$3)',[thread,'personal_account_setup',accountPayload],/authentication_required/);
  console.log(`Chat setup: ${checks} database cases PASS; actual setup commands; zero financial executor calls.`);
} finally { await db.close(); }
