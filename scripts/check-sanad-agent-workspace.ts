import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildAgentInsights } from '../supabase/functions/_shared/sanad-agent-insights.ts';

const workspace = readFileSync('src/features/assistant/SanadAgentWorkspace.tsx', 'utf8');
const sidebar = readFileSync('src/features/assistant/AssistantWorkspaceSidebar.tsx', 'utf8');
const responseBlocks = readFileSync('src/features/assistant/SanadAgentResponseBlocks.tsx', 'utf8');
const workspaceApi = readFileSync('src/features/assistant/assistantWorkspaceApi.ts', 'utf8');
const route = readFileSync('src/features/financial/FinancialWorkspaceRoute.tsx', 'utf8');
const api = readFileSync('src/features/assistant/assistantAgentApi.ts', 'utf8');
const runtime = readFileSync('supabase/functions/sanad-ai-agent-v1/index.ts', 'utf8');
const core = readFileSync('supabase/functions/_shared/sanad-agent-core.ts', 'utf8');
const presentation = readFileSync('supabase/functions/_shared/sanad-agent-presentation.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20260920071058_sanad_agent_workspace_v2.sql', 'utf8');
const visualMigration = readFileSync('supabase/migrations/20260920121801_sanad_agent_message_feedback_v1.sql', 'utf8');
const intelligenceMark = readFileSync('src/features/assistant/SanadIntelligenceMark.tsx', 'utf8');
const assistantPresentation = readFileSync('src/features/assistant/sanadAssistantPresentation.ts', 'utf8');
const messageActions = readFileSync('src/features/assistant/SanadMessageActions.tsx', 'utf8');
const styles = readFileSync('src/index.css', 'utf8');
const voiceButton = readFileSync('src/features/assistant/SanadVoiceDictationButton.tsx', 'utf8');
const voiceApi = readFileSync('src/features/assistant/assistantVoiceApi.ts', 'utf8');
const voiceFunction = readFileSync('supabase/functions/sanad-ai-transcribe-v1/index.ts', 'utf8');
const supabaseConfig = readFileSync('supabase/config.toml', 'utf8');
const attachmentMigration = readFileSync('supabase/migrations/20260920121807_sanad_agent_attachments_v1.sql', 'utf8');
const attachmentApi = readFileSync('src/features/assistant/assistantAttachmentApi.ts', 'utf8');
const attachmentComposer = readFileSync('src/features/assistant/SanadAttachmentComposer.tsx', 'utf8');
const attachmentFunction = readFileSync('supabase/functions/sanad-ai-attachment-analyze-v1/index.ts', 'utf8');
const actionMigration = readFileSync('supabase/migrations/20260920121815_sanad_agent_actions_v1.sql', 'utf8');
const actionApi = readFileSync('src/features/assistant/assistantActionApi.ts', 'utf8');
const actionCard = readFileSync('src/features/assistant/SanadAgentActionCard.tsx', 'utf8');
const insights = readFileSync('supabase/functions/_shared/sanad-agent-insights.ts', 'utf8');
const observabilityMigration = readFileSync('supabase/migrations/20260920121821_sanad_agent_observability_v1.sql', 'utf8');
const observabilityApi = readFileSync('src/features/assistant/assistantObservabilityApi.ts', 'utf8');
const productionDeploy = readFileSync('.github/workflows/deploy-production.yml', 'utf8');

for (const required of [
  'streamSanadAiAgentTurn',
  'get_my_account_center_v1',
  'خطوات التنفيذ والمصادر',
  'data-conversation-surface="open"',
  'thread_id',
  'AssistantWorkspaceSidebar',
  'SanadAgentResponseBlocks',
  'SanadMessageActions',
  'SanadIntelligenceMark',
  'mapSanadAssistantPresentationState',
]) {
  assert.ok(workspace.includes(required), `workspace missing ${required}`);
}

for (const required of [
  'محادثة جديدة',
  'المحادثات',
  'الذاكرة',
  'الضبط',
  'تنبيهات ذكية',
  'بطاقات البيانات',
]) {
  assert.ok(sidebar.includes(required), `sidebar missing ${required}`);
}

for (const required of [
  'customer_statement',
  'document_list',
  'replica_status',
  'نسخ الكشف',
  'انتبه إلى',
]) {
  assert.ok(responseBlocks.includes(required), `response blocks missing ${required}`);
}

for (const rpc of [
  'create_my_sanad_agent_thread_v1',
  'get_my_sanad_agent_preferences_v1',
  'update_my_sanad_agent_preferences_v1',
  'forget_my_sanad_agent_memory_v1',
]) {
  assert.ok(workspaceApi.includes(rpc), `workspace API missing ${rpc}`);
  assert.ok(migration.includes(rpc), `migration missing ${rpc}`);
}

for (const rpc of [
  'list_my_sanad_agent_threads_v2',
  'get_my_sanad_agent_thread_v2',
  'get_my_sanad_agent_context_v2',
  'mark_my_sanad_agent_thread_read_v1',
]) {
  assert.ok(workspaceApi.includes(rpc), `workspace API missing shared runtime RPC ${rpc}`);
}

for (const required of [
  'loadAgentCloudContext',
  'get_my_sanad_agent_context_v2',
  'save_sanad_agent_turn_v3',
  'thread_read_only',
  'upsert_sanad_agent_memory_v1',
  'buildAgentPresentation',
  'maybeRefreshThreadSummary',
]) {
  assert.ok(runtime.includes(required), `runtime missing ${required}`);
}

assert.match(core, /slice\(-24\)/, 'Agent context must include the latest 24 turns');
assert.match(core, /الذاكرة ليست مصدرًا للحقائق المالية الحالية/);
assert.match(presentation, /erp_customer/);
assert.match(presentation, /erp_document/);
assert.match(presentation, /baseline_public_id|snapshot_public_id/);

assert.match(route, /SanadAgentWorkspace/);
assert.doesNotMatch(route, /p_purpose:\s*'financial_workspace'/, 'legacy AI context preload must be removed');
assert.match(api, /sanad-ai-agent-v1/);
assert.match(api, /thread_id/);

for (const source of [workspace, sidebar, responseBlocks, workspaceApi]) {
  assert.doesNotMatch(source, /service_role/i);
  assert.doesNotMatch(source, /business_erp_snapshot_rows/);
}

assert.match(migration, /enable row level security/i);
assert.match(migration, /revoke all on table public\.sanad_agent_messages from public, anon, authenticated/i);
assert.match(migration, /grant execute on function public\.save_sanad_agent_turn_v1.*service_role/i);

console.log('SANAD Agent Workspace v2 contract passed.');


for (const required of ['Copy', 'Share2', 'Star', 'ThumbsUp', 'ThumbsDown']) {
  assert.ok(messageActions.includes(required), `message actions missing ${required}`);
}

assert.match(workspaceApi, /update_my_sanad_agent_message_feedback_v1/);
assert.match(visualMigration, /is_starred/);
assert.match(visualMigration, /rating smallint/);
assert.match(visualMigration, /update_my_sanad_agent_message_feedback_v1/);
assert.match(visualMigration, /security definer/i);
assert.match(visualMigration, /auth\.uid\(\)/);
assert.match(intelligenceMark, /data-sanad-intelligence-mark/);
assert.match(assistantPresentation, /waiting_approval/);
assert.match(assistantPresentation, /mapSanadAssistantPresentationState/);
assert.match(styles, /sanad-intelligence-mark--executing/);
assert.match(styles, /prefers-reduced-motion/);

console.log('SANAD Agent Visual v4 contract passed.');


for (const required of [
  'MediaRecorder',
  'getUserMedia',
  'MAX_RECORDING_MS',
  'transcribeSanadAudio',
  'تم تحويل الصوت إلى نص. راجعه قبل الإرسال.',
]) {
  assert.ok(voiceButton.includes(required), `voice button missing ${required}`);
}

assert.match(voiceApi, /sanad-ai-transcribe-v1/);
assert.match(voiceApi, /MAX_AUDIO_BYTES/);
assert.match(voiceApi, /invokeAuthenticatedSanadFunction/);
assert.doesNotMatch(voiceApi, /functions\.invoke/, 'Voice must use explicit authenticated fetch transport');
assert.match(voiceFunction, /gemini-3\.5-transcribe/);
assert.match(voiceFunction, /upload\/v1beta\/files/);
assert.match(voiceFunction, /transcription_config/);
assert.match(voiceFunction, /custom_vocabulary/);
assert.match(voiceFunction, /mode:\s*"smart"/);
assert.match(voiceFunction, /auth\.getUser/);
assert.match(voiceFunction, /method:\s*"DELETE"/);
assert.match(voiceFunction, /MAX_AUDIO_BYTES = 4 \* 1024 \* 1024/);
assert.match(voiceFunction, /MAX_RECORDING_MS = 90_000/);
assert.match(voiceFunction, /SANAD_VOICE_PREVIEW_ORIGINS/);
assert.doesNotMatch(voiceFunction, /trycloudflare\\.com/, 'Production voice CORS must not wildcard temporary preview domains.');
assert.match(voiceFunction, /"https:\/\/localhost"/);
assert.match(voiceFunction, /publicTranscriptionFailure/);
assert.doesNotMatch(
  voiceFunction,
  /return\s+respond\([^\n]*error:\s*cleanText\(error,\s*800\)/,
  'Voice responses must not expose raw provider errors',
);
assert.match(supabaseConfig, /\[functions\.sanad-ai-transcribe-v1\][\s\S]*verify_jwt = true/);
assert.match(workspace, /SanadVoiceDictationButton/);
assert.match(workspace, /راجع النص الصوتي قبل الإرسال/);
assert.doesNotMatch(voiceButton, /sendPrompt\(/);

console.log('SANAD Voice v1 contract passed.');


for (const required of [
  'SanadAttachmentComposer',
  'attachment_ids',
  'listSanadAgentAttachments',
  'pendingAttachments',
]) {
  assert.ok(workspace.includes(required), `attachment workspace missing ${required}`);
}

for (const required of [
  'sanad-agent-attachments',
  'create_my_sanad_agent_attachment_v1',
  'get_my_sanad_agent_attachment_v1',
  'list_my_sanad_agent_attachments_v1',
  'delete_my_sanad_agent_attachment_v1',
  'save_sanad_agent_turn_v2',
  'attachment_ids uuid[]',
]) {
  assert.ok(attachmentMigration.includes(required), `attachment migration missing ${required}`);
}

assert.match(attachmentMigration, /public\s*=\s*false/i);
assert.match(attachmentMigration, /enable row level security/i);
assert.match(attachmentMigration, /storage\.foldername\(name\)\)\[1\].*auth\.uid/s);
assert.match(attachmentMigration, /file_size_limit[\s\S]*20971520/);
assert.match(attachmentMigration, /grant execute on function public\.save_sanad_agent_turn_v2[\s\S]*service_role/i);
assert.doesNotMatch(attachmentMigration, /grant execute on function public\.save_sanad_agent_turn_v2[\s\S]*authenticated/i);

assert.match(attachmentApi, /MAX_FILE_BYTES = 20 \* 1024 \* 1024/);
assert.match(attachmentApi, /sanad-ai-attachment-analyze-v1/);
assert.match(attachmentApi, /invokeAuthenticatedSanadFunction/);
assert.doesNotMatch(attachmentApi, /functions\.invoke/, 'Attachment analysis must use explicit authenticated fetch transport');
assert.match(attachmentApi, /upsert:\s*false/);
assert.match(attachmentComposer, /MAX_PER_TURN = 3/);
assert.match(attachmentComposer, /لم تُنشأ أي عملية/);
assert.match(attachmentComposer, /فتح المستند المطابق المحتمل/);

assert.match(attachmentFunction, /gemini-3\.8-flash/);
assert.match(attachmentFunction, /upload\/v1beta\/files/);
assert.match(attachmentFunction, /get_business_erp_customer_candidates_v1/);
assert.match(attachmentFunction, /get_business_erp_documents_v1/);
assert.match(attachmentFunction, /link_existing/);
assert.match(attachmentFunction, /exactDocumentCandidates\.length === 1/);
assert.match(attachmentFunction, /expectedKind/);
assert.match(attachmentFunction, /isTextLike/);
assert.match(attachmentFunction, /TextDecoder/);
assert.match(attachmentFunction, /draft_candidate/);
assert.match(attachmentFunction, /write_performed:\s*false/);
assert.match(attachmentFunction, /requires_explicit_review:\s*true/);
assert.doesNotMatch(attachmentFunction, /sales_invoice|purchase_invoice|receipt_voucher|payment_voucher/);
assert.match(supabaseConfig, /\[functions\.sanad-ai-attachment-analyze-v1\][\s\S]*verify_jwt = true/);
assert.match(core, /مرفقات هذه الرسالة/);
assert.match(runtime, /loadAttachmentContext/);
assert.match(runtime, /attachment_not_ready/);
assert.match(runtime, /p_attachment_ids/);
assert.match(api, /attachment_ids/);

console.log('SANAD Attachments v1 contract passed.');


for (const required of [
  'buildAgentInsights',
  'obligation_overdue_v1',
  'budget_over_v1',
  'goal_past_due_v1',
  'business_overdue_documents_v1',
  'erp_replica_stale_24h_v1',
  'mergeAgentAttention',
]) {
  assert.ok(insights.includes(required), `Insight Engine missing ${required}`);
}

assert.match(runtime, /buildAgentInsights/);
assert.match(runtime, /mergeAgentAttention/);
assert.match(runtime, /sanad-insights-v2/);
assert.match(core, /inferAgentRoutingHint/);
assert.match(core, /finance_get_overview وfinance_get_budgets/);
assert.match(responseBlocks, /إشارة محسوبة/);
assert.match(responseBlocks, /المصدر:/);

const fixedNow = Date.parse('2026-09-20T09:00:00Z');
const insightFixture = buildAgentInsights([
  {
    name: 'finance_get_obligations',
    args: {},
    output: {
      items: [
        { id:'p1', obligation_type:'payable', outstanding_amount:10000, currency:'YER', due_date:'2026-09-18' },
        { id:'r1', obligation_type:'receivable', outstanding_amount:50, currency:'SAR', due_date:'2026-09-25' },
      ],
    },
  },
  {
    name: 'finance_get_budgets',
    args: {},
    output: {
      budgets: [
        { id:'b1', name:'البيت', currency:'YER', budget_amount:100000, spent_amount:110000, usage_percent:110, is_over_budget:true },
        { id:'b2', name:'الوقود', currency:'SAR', budget_amount:1000, spent_amount:850, usage_percent:85, is_over_budget:false },
      ],
    },
  },
  {
    name: 'finance_get_goals',
    args: {},
    output: {
      items: [
        { id:'g1', name:'احتياطي', target_amount:1000, current_amount:400, currency:'SAR', target_date:'2026-09-19' },
      ],
    },
  },
  {
    name: 'business_get_dashboard',
    args: { business_id:'b' },
    output: {
      overdue_count:2,
      receivables_by_currency:[
        { currency:'SAR', outstanding:500 },
        { currency:'YER', outstanding:200000 },
      ],
      payables_by_currency:[],
    },
  },
  {
    name: 'erp_get_replica_status',
    args: { business_id:'b' },
    output: {
      context:{
        available:true,
        snapshot_public_id:'snap',
        completed_at:'2026-09-19T07:00:00Z',
      },
    },
  },
], fixedNow);

assert.ok(insightFixture.some((item) => item.rule_id === 'obligation_overdue_v1' && item.body.includes('YER')));
assert.ok(insightFixture.some((item) => item.rule_id === 'obligation_due_soon_v1' && item.body.includes('SAR')));
assert.ok(insightFixture.some((item) => item.rule_id === 'budget_over_v1'));
assert.ok(insightFixture.some((item) => item.rule_id === 'budget_near_limit_v1'));
assert.ok(insightFixture.some((item) => item.rule_id === 'goal_past_due_v1'));
assert.ok(insightFixture.some((item) => item.rule_id === 'business_overdue_documents_v1'));
assert.ok(insightFixture.some((item) => item.rule_id === 'erp_replica_stale_24h_v1'));
assert.ok(insightFixture.every((item) => Boolean(item.source_label)));
assert.ok(insightFixture.every((item) => !item.body.includes('SAR + YER')));

assert.match(core, /broadAttention[\s\S]*finance_get_overview وfinance_get_budgets/);
assert.match(core, /broadAttention && businessId[\s\S]*business_get_dashboard/);
assert.match(core, /if \(replica\)[\s\S]*erp_get_replica_status/);

console.log('SANAD Agent Intelligence v2 contract passed.');


for (const required of [
  'sanad_agent_actions',
  'sanad_agent_action_events',
  'create_my_sanad_agent_action_draft_v1',
  'approve_my_sanad_agent_action_v1',
  'cancel_my_sanad_agent_action_v1',
  'agent_action_version_conflict',
  'create_personal_finance_transaction_v1',
  'create_business_commercial_draft_v1',
]) {
  assert.ok(actionMigration.includes(required), `Action v1 migration missing ${required}`);
}

assert.match(actionMigration, /status text not null default 'review'/);
assert.match(actionMigration, /for update/);
assert.match(actionMigration, /p_expected_version/);
assert.match(actionMigration, /status='approved'/);
assert.match(actionMigration, /status='executing'/);
assert.match(actionMigration, /status='completed'/);
assert.match(actionMigration, /v_normalized - 'metadata'/);
assert.match(actionMigration, /'writes_to_erp',false/);
assert.doesNotMatch(actionMigration, /post_business_commercial_document_v1/);
assert.doesNotMatch(actionMigration, /settle_business_commercial_document_v1/);
assert.doesNotMatch(actionMigration, /get_ai_erp_read_context_v1/);

for (const required of [
  'approve_my_sanad_agent_action_v1',
  'cancel_my_sanad_agent_action_v1',
  'get_my_sanad_agent_action_v1',
]) {
  assert.ok(actionApi.includes(required), `Action API missing ${required}`);
}

for (const required of ['اعتماد','تعديل','إلغاء','window.confirm','approval_effect']) {
  assert.ok(actionCard.includes(required), `Action review card missing ${required}`);
}
assert.match(actionCard, /cancelSanadAgentAction\(card\.action_id, version\)[\s\S]*onModify/);
assert.match(responseBlocks, /action_review/);
assert.match(responseBlocks, /payment_inbox_list/);
assert.match(workspace, /onModifyAction/);
assert.match(workspace, /business_get_payment_inbox/);

assert.match(core, /action_prepare_personal_transaction/);
assert.match(core, /action_prepare_commercial_document/);
assert.match(core, /finance_get_accounts/);
assert.match(core, /business_search_parties/);
assert.match(core, /business_get_payment_inbox/);
assert.match(core, /هذه مسودة مراجعة فقط/);
assert.doesNotMatch(core, /approve_my_sanad_agent_action_v1/);

assert.match(runtime, /action_requires_finance_accounts_resolution/);
assert.match(runtime, /action_party_not_resolved_in_turn/);
assert.match(runtime, /create_my_sanad_agent_action_draft_v1/);
assert.match(runtime, /get_business_payment_inbox_v3/);
assert.doesNotMatch(runtime, /claim_business_payment_v2|complete_business_payment_v2|release_business_payment_v2|resolve_business_payment_reuse_v1/);
assert.doesNotMatch(runtime, /post_business_commercial_document_v1|settle_business_commercial_document_v1|create_personal_finance_transaction_v1/);

console.log('SANAD Agent Action Integration v1 contract passed.');


for (const required of [
  'sanad_agent_performance_metrics',
  'record_sanad_agent_server_metric_v1',
  'record_my_sanad_agent_client_metric_v1',
  'get_my_sanad_agent_performance_v1',
  'first_progress_ms',
  'first_answer_ms',
  'context_load_ms',
  'attachment_context_ms',
  'model_latency_ms',
  'tool_latency_ms',
  'persistence_ms',
  'retry_count',
  'cached_tokens',
]) {
  assert.ok(observabilityMigration.includes(required), `Observability v1 migration missing ${required}`);
}

assert.match(observabilityMigration, /enable row level security/i);
assert.match(observabilityMigration, /using \(\(select auth\.uid\(\)\)=user_id\)/);
assert.match(observabilityMigration, /metric_scope_not_client_allowed/);
assert.match(observabilityMigration, /metric_scope_not_server_allowed/);
assert.match(observabilityMigration, /percentile_cont\(0\.50\)/);
assert.match(observabilityMigration, /percentile_cont\(0\.95\)/);
assert.match(observabilityMigration, /cache_ratio/);
assert.doesNotMatch(observabilityMigration, /message_text|prompt_text|document_text|file_name|customer_name|account_number/);

assert.match(observabilityApi, /record_my_sanad_agent_client_metric_v1/);
assert.match(observabilityApi, /get_my_sanad_agent_performance_v1/);
assert.match(api, /firstProgressMs/);
assert.match(api, /firstAnswerMs/);
assert.match(api, /agent_client_turn/);
assert.match(workspace, /thread_load/);
assert.match(attachmentApi, /attachment_upload/);
assert.match(sidebar, /أداء سند · آخر 7 أيام/);
assert.match(sidebar, /P50/);
assert.match(sidebar, /P95/);
assert.match(sidebar, /دون حفظ محتوى رسائلك/);

assert.match(runtime, /recordAgentServerMetric/);
assert.match(runtime, /modelLatencyMs/);
assert.match(runtime, /retryCount/);
assert.match(runtime, /persistenceMs/);
assert.match(runtime, /aggregateUsage/);
assert.match(voiceFunction, /record_sanad_agent_server_metric_v1/);
assert.match(attachmentFunction, /record_sanad_agent_server_metric_v1/);

assert.match(core, /maxAttempts = 3/);
assert.match(core, /response\.status === 429 \|\| response\.status >= 500/);
assert.match(core, /delayMs = retryCount === 1 \? 250 : 700/);
assert.match(core, /__sanad_retry_count/);
assert.match(core, /__sanad_http_latency_ms/);

console.log('SANAD Agent Performance & Observability v1 contract passed.');


for (const required of [
  'Verify SANAD Agent backend contract',
  '20260920071058',
  '20260920121801',
  '20260920121807',
  '20260920121815',
  '20260920121821',
  'sanad-ai-agent-v1',
  'sanad-ai-transcribe-v1',
  'sanad-ai-attachment-analyze-v1',
]) {
  assert.ok(productionDeploy.includes(required), `production release guard missing ${required}`);
}
assert.match(productionDeploy, /SUPABASE_ACCESS_TOKEN/);
assert.doesNotMatch(productionDeploy, /SUPABASE_DB_PASSWORD/, 'Production release guard must not depend on a database password');
assert.match(productionDeploy, /database\/query\/read-only/);
assert.match(productionDeploy, /supabase_migrations\.schema_migrations/);
assert.match(productionDeploy, /curl --fail-with-body/);
assert.match(productionDeploy, /supabase functions list/);

console.log('SANAD Production runtime release guard contract passed.');


// Phase 2 — Typography & Conversation Layout
assert.doesNotMatch(styles, /fonts\.googleapis\.com/, 'SANAD primary typography must not depend on Google Fonts at runtime');
assert.match(styles, /noto-sans-arabic-arabic-wght-normal\.woff2/);
assert.match(styles, /noto-sans-arabic-latin-wght-normal\.woff2/);
assert.match(styles, /font-display:\s*swap/);
assert.match(styles, /font-weight:\s*100 900/);
assert.match(styles, /Noto Sans Arabic/);
assert.match(workspace, /id="sanad-agent-workspace"/);
assert.match(workspace, /data-workspace-slot="composer"/);
assert.doesNotMatch(workspace, /sticky bottom-0/, 'Viewport contract keeps the composer in normal layout flow');
assert.match(workspace, /min-h-0 flex-1[^"]*overflow-y-auto/);
for (const source of [workspace, sidebar, responseBlocks, attachmentComposer, actionCard, voiceButton]) {
  assert.doesNotMatch(source, /font-black/, 'Phase 2 must remove black font weight from Agent UI');
}
console.log('SANAD Phase 2 typography and conversation layout contract passed.');
