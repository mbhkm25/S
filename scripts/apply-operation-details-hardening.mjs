import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';

const detailsPath = 'src/components/Details.tsx';
const scriptPath = 'scripts/apply-operation-details-hardening.mjs';
const workflowPath = '.github/workflows/apply-operation-details-hardening.yml';
let source = readFileSync(detailsPath, 'utf8');

function replaceRequired(oldValue, newValue, label) {
  if (source.includes(newValue)) return;
  if (!source.includes(oldValue)) throw new Error(`Missing patch anchor: ${label}`);
  source = source.replace(oldValue, newValue);
}

replaceRequired(
  "import {\n  getLinkableBusinessesForUser, linkOperationToBusiness,\n  LinkableBusinessItem\n} from '../lib/businessApi';",
  "import {\n  getLinkableBusinessesForUser, linkOperationToBusiness,\n  LinkableBusinessItem\n} from '../lib/businessApi';\nimport {\n  downloadOperationOriginalFile,\n  openOperationOriginalFile,\n  requestOperationFileAccess\n} from '../lib/operationFileAccess';\nimport {\n  calculateOperationTimeDiscrepancy,\n  formatOperationTemporalLabel,\n  resolveOperationTemporal\n} from '../lib/operationTemporal';",
  'secure helper imports'
);

const discrepancyStart = source.indexOf('// Time discrepancy warning helper');
const currencyStart = source.indexOf('// Static color map for Currency badges');
if (discrepancyStart >= 0 && currencyStart > discrepancyStart) {
  source = source.slice(0, discrepancyStart) + source.slice(currencyStart);
}

replaceRequired(
`        // Automatically fetch signed URL for inline document preview
        const meta = getOperationFileMeta(opData);
        if (meta.filePath) {
          fetchBackendSignedUrl(opData.public_token, 'open')
            .then(url => {
              if (mountedRef.current) {
                setSignedUrl(url);
              }
            })
            .catch(err => {
              console.warn('Failed to auto-fetch signed URL for inline document preview:', err);
              if (mountedRef.current) {
                setSignedUrlError(true);
              }
            });
        }`,
`        // Preview URLs are ephemeral. Request one for this render only and never
        // reuse it for the explicit open/download actions.
        const meta = getOperationFileMeta(opData);
        if (meta.filePath) {
          requestOperationFileAccess(opData.public_token, 'open')
            .then(result => {
              if (mountedRef.current) setSignedUrl(result.signedUrl);
            })
            .catch(err => {
              console.warn('Failed to prepare inline document preview:', err);
              if (mountedRef.current) setSignedUrlError(true);
            });
        }`,
  'fresh inline preview'
);

replaceRequired(
`      const url = await fetchBackendSignedUrl(operation.public_token, 'open');
      if (mountedRef.current) {
        setSignedUrl(url);
      }`,
`      const result = await requestOperationFileAccess(operation.public_token, 'open');
      if (mountedRef.current) setSignedUrl(result.signedUrl);`,
  'preview retry'
);

const backendStart = source.indexOf('  const fetchBackendSignedUrl = async (');
const openStart = source.indexOf('  const openOriginalFile = async () =>', backendStart);
if (backendStart >= 0 && openStart > backendStart) {
  source = source.slice(0, backendStart) + source.slice(openStart);
}

replaceRequired(
  "      const targetUrl = signedUrl || await fetchBackendSignedUrl(operation.public_token, 'open');",
  "      // Always mint a new link. The preview URL may already have expired.\n      const targetUrl = (await openOperationOriginalFile(operation.public_token)).signedUrl;",
  'fresh open action'
);

replaceRequired(
  "      const targetUrl = await fetchBackendSignedUrl(operation.public_token, 'download');",
  "      const targetUrl = (await downloadOperationOriginalFile(operation.public_token)).signedUrl;",
  'fresh download action'
);

replaceRequired(
`  // Retrieve timezone fields
  const txTimeStr = operation.transaction_datetime || data.transaction_datetime || null;
  const verifiedTimeStr = operation.verified_at || operation.confirmed_at || operation.created_at;

  // Compile alerts and discrepancy metrics
  const alerts: { type: 'critical' | 'warning' | 'info'; text: string; subtext?: string }[] = [];
  const timeInfo = calculateTimeDiscrepancy(txTimeStr || "", verifiedTimeStr || "");`,
`  const operationTemporal = resolveOperationTemporal(operation);
  const operationTemporalLabel = formatOperationTemporalLabel(operation);
  const verifiedTimeStr = operation.verified_at || operation.confirmed_at || operation.created_at;

  // The seven-minute comparison is valid only when the notice contains an
  // explicit time. A date-only notice is deliberately marked not applicable.
  const alerts: { type: 'critical' | 'warning' | 'info'; text: string; subtext?: string }[] = [];
  const timeInfo = calculateOperationTimeDiscrepancy(operation, verifiedTimeStr);`,
  'temporal resolution'
);

replaceRequired(
`  if (!txTimeStr) {
    alerts.push({
      type: 'info',
      text: 'وقت وتاريخ العملية غير متوفر في الإشعار.'
    });
  }`,
`  if (!operationTemporal.date) {
    alerts.push({ type: 'info', text: 'تاريخ العملية غير مذكور في الإشعار.' });
  } else if (!operationTemporal.timePresent) {
    alerts.push({
      type: 'info',
      text: 'الوقت غير مذكور في الإشعار؛ لذلك لم يُجرَ فحص فرق الوقت.'
    });
  }`,
  'date-only alert'
);

replaceRequired(
`            <span className="text-[9px] font-bold text-slate-400 block mb-0.5">وقت العملية</span>
            <span className="font-semibold text-slate-700 text-xs block font-arabic leading-tight">
              {txTimeStr ? \`${'${formatYemenDate(txTimeStr)} - ${formatYemenTime(txTimeStr)}'}\` : <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">غير متوفر</span>}
            </span>`,
`            <span className="text-[9px] font-bold text-slate-400 block mb-0.5">تاريخ ووقت العملية</span>
            <span className="font-semibold text-slate-700 text-xs block font-arabic leading-tight">
              {operationTemporal.date ? operationTemporalLabel : <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">غير متوفر</span>}
            </span>
            {operationTemporal.date && !operationTemporal.timePresent && (
              <span className="mt-1 block text-[9px] font-medium text-slate-400">الوقت غير مذكور في الإشعار</span>
            )}`,
  'date-only display'
);

// The canonical temporal helper replaces the legacy date/time formatters in this file.
source = source.replace(
  "import { toLatinDigits, formatYemenDate, formatYemenTime } from '../utils/numerals';",
  "import { toLatinDigits } from '../utils/numerals';"
);

writeFileSync(detailsPath, source);
for (const path of [scriptPath, workflowPath]) {
  try { unlinkSync(path); } catch {}
}
