import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';

const filePath = 'supabase/functions/sanad-v3-process-report/index.ts';
const workflowPath = '.github/workflows/patch-report-delivery-tracking.yml';
const scriptPath = 'scripts/patch-report-delivery-tracking.mjs';
let source = readFileSync(filePath, 'utf8');

source = source.replace(
  'const data = await res.json().catch(() => null); if (!res.ok) throw new Error(`whatsapp_send_failed_${res.status}`); return data as Json;',
  'const data = await res.json().catch(() => null); if (!res.ok) throw new Error(`whatsapp_send_failed_${res.status}`); const messageId = Array.isArray(data?.messages) && data.messages[0]?.id ? String(data.messages[0].id) : null; if (!messageId) throw new Error("whatsapp_send_missing_message_id"); return data as Json;'
);

const oldUpdate = 'const { error: sentError } = await sb.from("report_requests").update({ status: "sent", processing_stage: "completed", whatsapp_message_id: messageId, sent_at: new Date().toISOString(), processed_at: new Date().toISOString(), error_message: null, updated_at: new Date().toISOString() }).eq("id", report.id);';
const newUpdate = 'const acceptedAt = new Date().toISOString();\n    const { error: sentError } = await sb.from("report_requests").update({ status: "sent", processing_stage: "accepted_by_whatsapp", whatsapp_message_id: messageId, delivery_status: "accepted", accepted_at: acceptedAt, sent_at: acceptedAt, last_delivery_event_at: acceptedAt, delivery_attempts: Number((report as any).delivery_attempts || 0) + 1, processed_at: acceptedAt, error_message: null, delivery_error_code: null, delivery_error_message: null, updated_at: acceptedAt }).eq("id", report.id);';
if (!source.includes(oldUpdate)) throw new Error('report accepted update anchor not found');
source = source.replace(oldUpdate, newUpdate);
source = source.replace('return respond({ ok: true, report_id: report.id, status: "sent",', 'return respond({ ok: true, report_id: report.id, status: "accepted", delivery_status: "accepted",');
source = source.replace(
  'if (sb && report?.id) await sb.from("report_requests").update({ status: "failed", processing_stage: "failed", error_message: message.slice(0, 1000), processed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", report.id);',
  'if (sb && report?.id) { const failedAt = new Date().toISOString(); await sb.from("report_requests").update({ status: "failed", processing_stage: "failed", delivery_status: "failed", failed_at: failedAt, last_delivery_event_at: failedAt, delivery_error_message: message.slice(0, 1000), error_message: message.slice(0, 1000), processed_at: failedAt, updated_at: failedAt }).eq("id", report.id); }'
);

writeFileSync(filePath, source);
for (const path of [workflowPath, scriptPath]) { try { unlinkSync(path); } catch {} }
