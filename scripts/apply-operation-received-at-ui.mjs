import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';

const target = 'src/components/Details.tsx';
const workflow = '.github/workflows/apply-operation-received-at-ui.yml';
const script = 'scripts/apply-operation-received-at-ui.mjs';
let source = readFileSync(target, 'utf8');

const importAnchor = `import {
  calculateOperationTimeDiscrepancy,
  formatOperationTemporalLabel,
  resolveOperationTemporal
} from '../lib/operationTemporal';`;
const importReplacement = `${importAnchor}
import { formatOperationReceivedAt } from '../lib/operationReceiptTime';`;
if (!source.includes("from '../lib/operationReceiptTime'")) {
  if (!source.includes(importAnchor)) throw new Error('Temporal import anchor missing');
  source = source.replace(importAnchor, importReplacement);
}

const computeAnchor = `  const operationTemporal = resolveOperationTemporal(operation);
  const operationTemporalLabel = formatOperationTemporalLabel(operation);
  const verifiedTimeStr = operation.verified_at || operation.confirmed_at || operation.created_at;`;
const computeReplacement = `  const operationTemporal = resolveOperationTemporal(operation);
  const operationTemporalLabel = formatOperationTemporalLabel(operation);
  const operationReceivedAtLabel = formatOperationReceivedAt(operation);
  const verifiedTimeStr = operation.verified_at || operation.confirmed_at || operation.created_at;`;
if (!source.includes('const operationReceivedAtLabel = formatOperationReceivedAt(operation);')) {
  if (!source.includes(computeAnchor)) throw new Error('Temporal compute anchor missing');
  source = source.replace(computeAnchor, computeReplacement);
}

const uiAnchor = `          {/* Reference Ref */}
          <div className="pt-1 sm:pt-0">`;
const uiReplacement = `          {/* SANAD receipt timestamp */}
          <div className="border-b border-slate-100 sm:border-b-0 sm:border-l sm:border-slate-150 pb-2 sm:pb-0 sm:pl-3.5 pt-1 sm:pt-0">
            <span className="text-[9px] font-bold text-slate-400 block mb-0.5">وقت إرسال الإشعار إلى سند</span>
            <span className="font-semibold text-slate-700 text-xs block font-arabic leading-tight">
              {operationReceivedAtLabel || <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">غير متوفر</span>}
            </span>
            {operationReceivedAtLabel && (
              <span className="mt-1 block text-[9px] font-medium text-slate-400">بتوقيت اليمن — Asia/Aden</span>
            )}
          </div>

          {/* Reference Ref */}
          <div className="pt-1 sm:pt-0">`;
if (!source.includes('وقت إرسال الإشعار إلى سند')) {
  if (!source.includes(uiAnchor)) throw new Error('Receipt UI anchor missing');
  source = source.replace(uiAnchor, uiReplacement);
}

writeFileSync(target, source);
for (const path of [workflow, script]) {
  try { unlinkSync(path); } catch {}
}
