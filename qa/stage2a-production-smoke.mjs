import { chromium } from 'playwright';
import fs from 'node:fs';

const base = 'https://app.sanadflow.com';
const userId = '11111111-1111-4111-8111-111111111111';
const threadId = '22222222-2222-4222-8222-222222222222';
const businessId = '33333333-3333-4333-8333-333333333333';
const nowIso = '2026-09-22T18:50:00.000Z';

function b64u(value) { return Buffer.from(JSON.stringify(value)).toString('base64url'); }
const now = Math.floor(Date.now() / 1000);
const jwt = `${b64u({alg:'HS256',typ:'JWT'})}.${b64u({
  aud:'authenticated', exp:now+7200, iat:now, sub:userId, email:'qa@sanadflow.local',
  app_metadata:{provider:'email',providers:['email']}, user_metadata:{full_name:'مستخدم اختبار سند'},
  role:'authenticated', aal:'aal1', session_id:'44444444-4444-4444-8444-444444444444'
})}.qa`;
const session = {
  access_token:jwt, refresh_token:'qa-refresh', token_type:'bearer', expires_in:7200, expires_at:now+7200,
  user:{id:userId,aud:'authenticated',role:'authenticated',email:'qa@sanadflow.local',
    email_confirmed_at:nowIso,confirmed_at:nowIso,last_sign_in_at:nowIso,
    app_metadata:{provider:'email',providers:['email']},user_metadata:{full_name:'مستخدم اختبار سند'},
    identities:[],created_at:nowIso,updated_at:nowIso}
};

const thread = {
  id:threadId,business_id:businessId,title:'محادثة إنتاج لاختبار Stage 2A',
  status:'active',summary:null,last_message_at:nowIso,message_count:2,created_at:nowIso,updated_at:nowIso
};
const messages = [
  {id:'55555555-5555-4555-8555-555555555555',sequence_no:1,role:'user',
   content:'أعطني كشف حساب العميل مع الرصيد والحركات الأخيرة.',response:null,tool_trace:[],
   request_id:null,model:null,thinking_level:null,is_starred:false,rating:null,attachment_ids:[],created_at:nowIso},
  {id:'66666666-6666-4666-8666-666666666666',sequence_no:2,role:'assistant',
   content:'الرصيد الختامي **551.12 ر.س**. هذا نص عربي مع 1,053.00 SAR وEnglish mixed content للتحقق من الخط والقراءة.',
   response:{answer:'عرض مختصر',cards:[{type:'customer_statement',title:'كشف حساب العميل — إبراهيم محمد بعلي',
     account_number:'ACC-2026-001',account_id:'165',movement_count:14,
     currency_summaries:[{currency:'SAR',opening_balance:1053,debit:551.12,credit:501.88,closing_balance:551.12}],
     from_date:'2026-08-01',to_date:'2026-09-22',copy_text:'كشف حساب العميل — 551.12 ر.س',href:'#'}],
     attention:[{severity:'warning',title:'رصيد يحتاج متابعة',body:'الرصيد الحالي ما يزال مفتوحًا.',source_label:'دفتر العميل'}],
     entities:[]},
   tool_trace:[{name:'erp_get_customer_statement',source:'ERP Cloud Replica',status:'completed',latency_ms:312}],
   request_id:'qa-request',model:'gemini-3.8-flash',thinking_level:'medium',is_starred:false,rating:null,attachment_ids:[],created_at:nowIso}
];

const rpc = {
  get_my_account_center_v1:{profile:{full_name:'مستخدم اختبار سند'},subscription:{plan_code:'PRO',status:'active'},
    notifications:{unread:3,total_active:5},devices:{active_push:2,last_seen_at:nowIso},
    businesses:[{id:businessId,name:'متجر باحكم للعسل — فرع المكلا',slug:'bahkum-honey',verification_status:'verified'}],
    finance:{active_accounts:4,active_budgets:2,active_goals:1,open_obligations:3}},
  get_my_sanad_agent_preferences_v1:{user_id:userId,save_history_enabled:true,memory_enabled:true,proactive_insights_enabled:true,response_cards_enabled:true,created_at:nowIso,updated_at:nowIso},
  list_my_sanad_agent_threads_v1:[thread],
  get_my_sanad_agent_thread_v1:{thread,messages},
  get_my_sanad_agent_context_v1:{memories:[]},
  list_my_sanad_agent_attachments_v1:[],
  record_sanad_agent_client_metric_v1:true,
  get_my_sanad_agent_performance_v1:{scopes:[]},
  get_my_finance_dashboard_v1:{cashflow_by_currency:[{currency:'SAR',income:12840.5,expense:8420.25,net:4420.25}],accounts:4,open_obligations:[{currency:'SAR',payable:2100,receivable:6450}],due_soon_count:2,active_budgets:2,active_goals:1},
  get_business_commercial_dashboard_v1:{business_id:businessId,totals_by_currency:[{currency:'SAR',sales:108247.54,purchases:248014,receipts:108422.13,payments:282959,expenses:13250}],receivables_by_currency:[{currency:'SAR',outstanding:52031}],payables_by_currency:[{currency:'SAR',outstanding:87000}],overdue_count:4}
};

function rpcValue(name){ return Object.prototype.hasOwnProperty.call(rpc,name) ? rpc[name] : []; }

const browser = await chromium.launch({headless:true});
async function makeContext(viewport){
  const context = await browser.newContext({viewport,locale:'ar-YE',colorScheme:'light',serviceWorkers:'block'});
  await context.addInitScript(({session})=>{
    localStorage.setItem('sb-hudbzlgclghlhazlduas-auth-token',JSON.stringify(session));
  },{session});
  await context.route('**/auth/v1/user',route=>route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(session.user)}));
  await context.route('**/auth/v1/token**',route=>route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(session)}));
  await context.route('**/rest/v1/rpc/**',route=>{
    const name = new URL(route.request().url()).pathname.split('/').pop();
    return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(rpcValue(name))});
  });
  await context.route('**/rest/v1/profiles*',route=>route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify([{full_name:'مستخدم اختبار سند',avatar_path:null}])}));
  return context;
}

async function smoke(path,viewport,name){
  const context = await makeContext(viewport);
  const page = await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(base+path,{waitUntil:'domcontentloaded'});
  if (path === '/sanad-ai') {
    await page.locator('[data-scroll-owner="timeline"]').waitFor({state:'attached',timeout:12000}).catch(()=>undefined);
  } else {
    await page.waitForTimeout(1800);
  }
  await page.evaluate(()=>document.fonts?.ready);
  const state = await page.evaluate(()=>({
    url:location.pathname,
    width:innerWidth,height:innerHeight,
    scrollWidth:document.documentElement.scrollWidth,
    horizontalOverflow:document.documentElement.scrollWidth > innerWidth + 2,
    font:getComputedStyle(document.body).fontFamily,
    brandGreen:getComputedStyle(document.documentElement).getPropertyValue('--sanad-brand-green').trim(),
    bottomClearance:getComputedStyle(document.documentElement).getPropertyValue('--sanad-mobile-bottom-clearance').trim(),
    productArea:document.querySelector('[data-product-area]')?.getAttribute('data-product-area') || null,
    activeNav:document.querySelector('[data-active="true"]')?.textContent?.trim() || null,
    timelineOverflow:document.querySelector('[data-scroll-owner="timeline"]') ? getComputedStyle(document.querySelector('[data-scroll-owner="timeline"]')).overflowY : null,
    composer:!!document.querySelector('[data-workspace-slot="composer"]'),
    sidebar:!!document.querySelector('.sanad-sidebar-surface'),
    structured:!!document.querySelector('.sanad-surface'),
    bodyText:document.body.innerText.slice(0,1200),
    rootHtml:document.getElementById('root')?.innerHTML.slice(0,1200) || '',
  }));
  fs.writeFileSync(`postflight/${name}.json`,JSON.stringify({state,errors},null,2));
  await page.screenshot({path:`postflight/${name}.png`,fullPage:false});
  if (state.horizontalOverflow) throw new Error(`${name}: horizontal overflow`);
  if (!state.brandGreen) throw new Error(`${name}: Stage 2A semantic tokens missing`);
  if (errors.length) throw new Error(`${name}: page errors: ${errors.join(' | ')}`);
  await context.close();
  return state;
}

const results = {};
results.aiDesktop = await smoke('/sanad-ai',{width:1366,height:768},'sanad-ai-1366x768');
results.aiMobile = await smoke('/sanad-ai',{width:390,height:844},'sanad-ai-390x844');
results.financial = await smoke('/financial',{width:1366,height:768},'financial-1366x768');
results.commercial = await smoke('/commercial',{width:1366,height:768},'commercial-1366x768');
results.account = await smoke('/account-center',{width:1366,height:768},'account-1366x768');

if (!results.aiDesktop.composer || !results.aiDesktop.sidebar) throw new Error('SANAD AI workspace shell incomplete');
if (!results.aiDesktop.structured) throw new Error('Structured response surface not rendered');
if (results.aiDesktop.timelineOverflow !== 'auto') throw new Error(`Timeline overflow contract changed: ${results.aiDesktop.timelineOverflow}`);
if (results.aiMobile.horizontalOverflow) throw new Error('Mobile conversation overflow');
if (!results.aiMobile.bottomClearance) throw new Error('Mobile bottom clearance token missing');
if (results.financial.productArea !== 'financial') throw new Error('Financial shell signature missing');
if (results.commercial.productArea !== 'business') throw new Error('Commercial shell signature missing');
if (results.account.productArea !== 'account') throw new Error('Account shell signature missing');

fs.writeFileSync('postflight/runtime-smoke.json',JSON.stringify(results,null,2));
await browser.close();
