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
const config = {host:'127.0.0.1',port:5432,user:'postgres',password:'sanad_test',database:'sanad_draft_test'};
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
    create role anon; create role authenticated; create role service_role;
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
  const before = await create();
  // Freeze old canonical outputs for every unaffected action variant.
  const equivalence = [
    [{...payload,transaction_type:'income',category_id:null},thread,'personal_transaction',[]],
    [{transaction_type:'transfer',amount:3,source_account_id:account,destination_account_id:account,
      transaction_at:payload.transaction_at},thread,'personal_transaction',[]],
    ...['quotation','sales_invoice','purchase_invoice','receipt','payment','expense'].map(document_type =>
      [{business_id:business,document_type,currency:'SAR',description:'fixture',amount:5,
        document_date:'2026-09-27'},businessThread,'commercial_document_draft',[]]),
  ];
  // A second owned SAR account is required for transfer parity.
  await db.exec('reset role');
  const transferAccount = '40000000-0000-0000-0000-000000000004';
  await db.query("insert into public.personal_finance_accounts values($1,$2,'حساب تحويل','SAR','active',null)",[transferAccount,uid]);
  equivalence[1][0].destination_account_id=transferAccount;
  await db.exec('set role authenticated');
  const baseline = [];
  for (const args of equivalence) baseline.push(await create(...args));
  await db.exec('reset role');
  await db.exec(read(migration));
  await db.exec('set role authenticated');
  // Same input after extraction returns original ID, payload and review exactly.
  assert.deepEqual(await create(), before); checks++;
  for(let i=0;i<equivalence.length;i++) {
    // Call the new shared builder directly as the migration owner to compare
    // complete normalization/review; dedupe alone would mask a review regression.
    await db.exec('reset role');
    const [p,t,type,attachments] = equivalence[i];
    const contract=await scalar('select private.normalize_sanad_agent_action_v1($1,$2,$3,$4,$5::uuid[]) as value',
      [t,type,p,baseline[i].id,attachments]);
    assert.deepEqual(contract.payload,baseline[i].payload);
    assert.deepEqual(contract.review,baseline[i].review); checks++;
    await db.exec('set role authenticated');
  }
  await denied('select private.normalize_sanad_agent_action_v1($1,$2,$3,$4,$5::uuid[])',
    [thread,'personal_transaction',payload,before.id,[attachment]],/permission denied/);
  const changed = { ...payload, amount:'50.123456',currency:'YER',account_id:otherAccount,
    category_id:null,description:'وصف معدل',transaction_at:'2026-09-28T08:00:00+03:00' };
  const revised = await edit(before.id,1,changed);
  assert.equal(revised.id,before.id); assert.equal(revised.version,2);
  assert.equal(revised.status,'review'); assert.equal(revised.payload.amount,50.123456);
  assert.equal(revised.review.amount,50.123456); assert.equal(revised.review.currency,'YER');
  assert.equal(revised.review.fields[1].value,'حساب ريال يمني');
  assert.equal(revised.review.fields[2].value,'بدون تصنيف');
  assert.deepEqual(revised.payload.metadata,before.payload.metadata);
  assert.deepEqual(revised.attachment_ids,before.attachment_ids); checks++;
  assert.deepEqual(await edit(before.id,2,changed),revised); checks++;
  await rejectEdit(before.id,1,changed,/agent_action_version_conflict/);
  await denied('select public.approve_my_sanad_agent_action_v1($1,1)',[before.id],/agent_action_version_conflict/);
  for(const fn of ['approve_my_sanad_agent_action_v1','cancel_my_sanad_agent_action_v1']) {
    await denied(`select public.${fn}($1,null)`,[before.id],/valid_expected_version_required/);
    await denied(`select public.${fn}($1,0)`,[before.id],/valid_expected_version_required/);
  }
  await rejectEdit(before.id,null,changed,/valid_expected_version_required/);
  await rejectEdit(before.id,2,{...changed,business_id:business},/invalid_expense_edit_fields/);
  await rejectEdit(before.id,2,{...changed,transaction_type:'income'},/invalid_expense_edit_fields/);
  await rejectEdit(before.id,2,{...changed,attachment_ids:[]},/invalid_expense_edit_fields/);
  await rejectEdit(before.id,2,{...changed,metadata:{}},/invalid_expense_edit_fields/);
  await rejectEdit(before.id,2,{...changed,account_id:foreignAccount},/action_account_not_found/);
  await rejectEdit(before.id,2,{...changed,currency:'SAR'},/action_account_currency_mismatch/);
  for(const amount of ['0','-1','NaN','Infinity','100000000000000'])
    await rejectEdit(before.id,2,{...changed,amount},/invalid_action_amount/);
  for(const date of [null,'','not-a-date','infinity'])
    await rejectEdit(before.id,2,{...changed,transaction_at:date},/invalid_action_transaction_at/);
  await rejectEdit(before.id,2,{...changed,description:'x'.repeat(501)},/action_note_too_long_or_missing/);
  await rejectEdit(before.id,2,{...changed,category_id:foreignAccount},/action_category_not_found/);
  const second = await create({...payload,amount:'70'});
  await rejectEdit(second.id,1,changed,/identical_active_action_already_exists/);
  assert.equal((await create(changed)).id,before.id); checks++;
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[foreign]);
  await rejectEdit(before.id,2,changed,/agent_action_not_found/);
  await denied('select public.create_my_sanad_agent_action_draft_v1($1,$2,$3)',[thread,'personal_transaction',payload],/agent_thread_not_found/);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
  await denied('select public.create_my_sanad_agent_action_draft_v1($1,$2,$3)',[businessThread,'personal_transaction',payload],/agent_action_personal_project_required/);
  const commercial = await create({business_id:business,document_type:'expense',currency:'SAR',amount:5,description:'synthetic'},businessThread,'commercial_document_draft',[]);
  await rejectEdit(commercial.id,1,changed,/agent_action_edit_variant_not_supported/);
  await db.exec('reset role');
  await db.query("update public.sanad_agent_attachments set status='deleted' where id=$1",[attachment]);
  await db.exec('set role authenticated');
  await rejectEdit(before.id,2,changed,/action_attachment_not_ready_or_not_owned/);
  await db.exec('reset role');
  await db.query("update public.sanad_agent_attachments set status='ready' where id=$1",[attachment]);
  await db.query("update public.sanad_agent_threads set status='archived' where id=$1",[thread]);
  await db.exec('set role authenticated');
  await rejectEdit(before.id,2,changed,/agent_thread_not_found/);
  await db.exec('reset role');
  await db.query("update public.sanad_agent_threads set status='active' where id=$1",[thread]);
  for(const status of ['approved','executing','completed','cancelled','failed']) {
    await db.query('update public.sanad_agent_actions set status=$1 where id=$2',[status,second.id]);
    await db.exec('set role authenticated');
    await rejectEdit(second.id,1,payload,/agent_action_not_editable/);
    await db.exec('reset role');
  }
  const work = (await db.query('select * from public.sanad_work_items where source_id=$1',[before.id])).rows;
  assert.equal(work.length,1); assert.equal(work[0].status,'open'); assert.equal(work[0].summary,'وصف معدل'); checks++;
  const events = (await db.query("select data from public.sanad_agent_action_events where action_id=$1 and event_type='edited'",[before.id])).rows;
  assert.equal(events.length,1); assert.equal(events[0].data.version,2);
  assert.equal(JSON.stringify(events).includes('وصف معدل'),false); checks++;
  assert.equal(await scalar('select count(*)::int as value from public.test_execution_calls'),0); checks++;
  assert.equal(await scalar("select count(*)::int as value from public.sanad_domain_events where event_type='agent.action.edited'"),1); checks++;
  await db.exec('set role anon');
  await rejectEdit(before.id,2,changed,/permission denied/);
  await db.exec('reset role');
  if (postgresMode) {
    const a=new pg.Client(config),b=new pg.Client(config);
    await a.connect(); await b.connect();
    try {
      for (const c of [a,b]) {
        await c.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
        await c.query('set role authenticated');
        await c.query("set statement_timeout='10s'");
      }
      const makeSql='select public.create_my_sanad_agent_action_draft_v1($1,$2,$3) as value';
      const args=[thread,'personal_transaction',{...payload,amount:101}];
      await a.query('begin');
      const first=(await a.query(makeSql,args)).rows[0].value;
      const pending=b.query(makeSql,args);
      await a.query('commit');
      const other=(await pending).rows[0].value;
      assert.equal(first.id,other.id); checks++;
      // Two sessions submit the same reviewed version; only first succeeds.
      const sql='select public.update_my_sanad_agent_action_draft_v2($1,$2,$3) as value';
      await a.query('begin');
      await a.query(sql,[first.id,1,{...payload,amount:102}]);
      const stale=assert.rejects(b.query(sql,[first.id,1,{...payload,amount:103}]),/agent_action_version_conflict/);
      await a.query('commit'); await stale; checks++;
      // Different IDs racing toward an identical payload: unique active index arbitrates.
      const rival=(await a.query(makeSql,[thread,'personal_transaction',{...payload,amount:104}])).rows[0].value;
      await a.query('begin');
      await a.query(sql,[first.id,2,{...payload,amount:105}]);
      const collision=assert.rejects(b.query(sql,[rival.id,1,{...payload,amount:105}]),/identical_active_action_already_exists/);
      await a.query('commit'); await collision; checks++;
      assert.equal(await scalar('select count(*)::int as value from public.test_execution_calls'),0);
    } finally {await a.end();await b.end();}
  }
  console.log(`Stage 2D.2-B ${postgresMode?'multi-session PostgreSQL':'isolated PGlite'}: ${checks} cases PASS; zero executor calls.`);
} finally { await db.close(); }
