import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';

const detailsPath = 'src/components/Details.tsx';
const workflowPath = '.github/workflows/apply-financial-entity-details-logo.yml';
const scriptPath = 'scripts/apply-financial-entity-logo-to-details.mjs';

let source = readFileSync(detailsPath, 'utf8');

const importAnchor = "import ProUpgradeModal from './ProUpgradeModal';";
const logoImport = "import FinancialEntityLogo from './FinancialEntityLogo';";
if (!source.includes(logoImport)) {
  if (!source.includes(importAnchor)) throw new Error('Details import anchor was not found.');
  source = source.replace(importAnchor, `${importAnchor}\n${logoImport}`);
}

const oldSummary = `<div className="flex items-center gap-1.5 text-slate-400 text-xs font-bold font-arabic">\n            <Store className="w-3.5 h-3.5" />\n            <span>ملخص التحقق السريع</span>\n          </div>`;

const newSummary = `<div className="flex items-center gap-2">\n            <FinancialEntityLogo\n              entity={financialEntity}\n              className="h-10 w-10 rounded-xl border border-slate-100"\n              imageClassName="h-full w-full object-contain p-1"\n              decorative\n            />\n            <div>\n              <span className="block text-[10px] font-bold text-slate-400 font-arabic">ملخص التحقق السريع</span>\n              {financialEntity && <strong className="mt-0.5 block text-[11px] text-slate-800 font-arabic">{financialEntity}</strong>}\n            </div>\n          </div>`;

if (!source.includes(newSummary)) {
  if (!source.includes(oldSummary)) throw new Error('Quick summary logo anchor was not found.');
  source = source.replace(oldSummary, newSummary);
}

if (!source.includes('<Store ')) {
  source = source.replace(', X, Store, Copy,', ', X, Copy,');
}

writeFileSync(detailsPath, source);

for (const path of [workflowPath, scriptPath]) {
  try { unlinkSync(path); } catch {}
}
