from pathlib import Path
import re

ui_path = Path('src/features/operations/OperationDetailsRuntimeV2.tsx')
ui = ui_path.read_text(encoding='utf-8')

replacements = [
    (
        "  AlertTriangle,\n  CheckCircle2,",
        "  AlertTriangle,\n  ArrowRight,\n  CheckCircle2,",
    ),
    (
        "function Fact({ label, value, mono = false, wide = false }: { label: string; value?: string | null; mono?: boolean; wide?: boolean }) {\n  if (!value) return null;\n  return (\n    <div className={wide ? 'col-span-2' : ''}>\n      <span className=\"block text-[9px] font-bold text-slate-400\">{label}</span>\n      <b className={`mt-0.5 block truncate text-[12px] leading-5 text-slate-900 ${mono ? 'font-mono' : ''}`} dir={mono ? 'ltr' : undefined}>\n        {value}\n      </b>\n    </div>\n  );\n}",
        "function Fact({ label, value, mono = false, wide = false }: { label: string; value?: string | null; mono?: boolean; wide?: boolean }) {\n  if (!value) return null;\n  return (\n    <div className={`${wide ? 'col-span-2' : ''} min-w-0 rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-2.5`}>\n      <span className=\"block text-[9px] font-bold text-slate-400\">{label}</span>\n      <b className={`mt-1 block break-words text-[12px] leading-5 text-slate-900 ${mono ? 'font-mono' : ''}`} dir={mono ? 'ltr' : undefined}>\n        {value}\n      </b>\n    </div>\n  );\n}",
    ),
    (
        "        p_source: 'operation_details_runtime_v3',",
        "        p_source: 'operation_details',",
    ),
    (
        "  useEffect(() => {\n    if (!runtime) return;",
        "  useEffect(() => {\n    if (!runtime || !token) return;",
    ),
    (
        "  }, [runtime]);",
        "  }, [runtime, token]);",
    ),
    (
        "  const refresh = useCallback(async () => {",
        "  useEffect(() => {\n    if (token) return;\n    setRuntime(null);\n    setHost(null);\n    setFullscreen(false);\n    setPreviewUrl(null);\n    setOriginalUrl(null);\n    setError(null);\n    setMessage(null);\n  }, [token]);\n\n  const refresh = useCallback(async () => {",
    ),
    (
        "      <section dir=\"rtl\" className=\"mx-auto max-w-2xl space-y-3 pb-36 font-arabic\">",
        "      <section dir=\"rtl\" className=\"mx-auto max-w-2xl space-y-3 pb-6 font-arabic\">",
    ),
    (
        "        <div className=\"flex items-center justify-between gap-3 px-1 text-[10px] text-slate-500\">\n          <span className=\"inline-flex items-center gap-1.5\"><Clock3 className=\"h-3.5 w-3.5\" />وصل إلى سند: <b className=\"text-slate-700\">{fmt(runtime.timing.received_at)}</b></span>\n          <span className={`rounded-full border px-2.5 py-1 font-black ${statusClass}`}>{statusLabel}</span>\n        </div>",
        "        <div className=\"flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[10px] text-slate-500 shadow-sm\">\n          <button type=\"button\" onClick={() => window.history.back()} className=\"inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600\" aria-label=\"الرجوع\"><ArrowRight className=\"h-4 w-4\" /></button>\n          <span className=\"inline-flex min-w-0 flex-1 items-center gap-1.5\"><Clock3 className=\"h-3.5 w-3.5 shrink-0\" /><span className=\"truncate\">وصل إلى سند: <b className=\"text-slate-700\">{fmt(runtime.timing.received_at)}</b></span></span>\n          <span className={`shrink-0 rounded-full border px-2.5 py-1 font-black ${statusClass}`}>{statusLabel}</span>\n        </div>",
    ),
    (
        "        <article className=\"rounded-[26px] border border-slate-200 bg-white p-3.5 shadow-sm\">",
        "        <article className=\"rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm\">",
    ),
    (
        "            <div className={`${currentAnalysisState === 'ready' ? '' : 'mt-3'} grid grid-cols-2 gap-x-4 gap-y-2.5`}>",
        "            <div className={`${currentAnalysisState === 'ready' ? '' : 'mt-3'} grid grid-cols-2 gap-2.5`}>",
    ),
    (
        "              {lag ? <div className=\"col-span-2 rounded-xl bg-slate-50 px-3 py-2 text-[10px] font-bold text-slate-600\">{lag}</div> : null}",
        "              {lag ? <div className=\"col-span-2 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-3 py-2.5 text-[10px] font-bold text-emerald-800\">{lag}</div> : null}",
    ),
]

for old, new in replacements:
    count = ui.count(old)
    if count != 1:
        raise SystemExit(f'UI replacement expected one match, found {count}: {old[:80]!r}')
    ui = ui.replace(old, new, 1)

old_tail = """        {tab === 'record' ? (
          <section className=\"space-y-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm\">
            <div className=\"flex items-center gap-2\"><History className=\"h-5 w-5 text-slate-500\" /><h2 className=\"text-sm font-black text-slate-900\">سجل العملية</h2></div>
            <div className=\"grid grid-cols-2 gap-2 text-[11px]\"><div className=\"rounded-2xl bg-slate-50 p-3\"><span className=\"text-slate-400\">وقت الإدخال</span><b className=\"mt-1 block text-slate-900\">{fmt(runtime.timing.received_at)}</b></div><div className=\"rounded-2xl bg-slate-50 p-3\"><span className=\"text-slate-400\">وقت العملية</span><b className=\"mt-1 block text-slate-900\">{fmt(runtime.timing.transaction_at)}</b></div><div className=\"col-span-2 rounded-2xl border border-slate-100 p-3\"><span className=\"text-slate-400\">التحقق</span><b className=\"mt-1 block text-slate-900\">{runtime.verification.verified_by_name ? `تحقق ${runtime.verification.verified_by_name}` : 'لم يسجل تحقق شخصي بعد'}</b>{runtime.verification.verified_at ? <span className=\"mt-1 block text-slate-500\">{fmt(runtime.verification.verified_at)}</span> : null}</div></div>
          </section>
        ) : null}
      </section>,
      host,
    )}

    {createPortal(<div dir=\"rtl\" className=\"fixed inset-x-0 bottom-[calc(68px+env(safe-area-inset-bottom))] z-[135] mx-auto max-w-2xl px-3\"><div className=\"rounded-[24px] border border-slate-200 bg-white/95 p-3 shadow-[0_-12px_35px_rgba(15,23,42,.12)] backdrop-blur\">{action}</div></div>, document.body)}
"""

new_tail = """        {tab === 'record' ? (
          <section className=\"space-y-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm\">
            <div className=\"flex items-center gap-2\"><History className=\"h-5 w-5 text-slate-500\" /><h2 className=\"text-sm font-black text-slate-900\">سجل العملية</h2></div>
            <div className=\"grid grid-cols-2 gap-2 text-[11px]\"><div className=\"rounded-2xl border border-slate-200 bg-slate-50 p-3\"><span className=\"text-slate-400\">وقت الإدخال</span><b className=\"mt-1 block text-slate-900\">{fmt(runtime.timing.received_at)}</b></div><div className=\"rounded-2xl border border-slate-200 bg-slate-50 p-3\"><span className=\"text-slate-400\">وقت العملية</span><b className=\"mt-1 block text-slate-900\">{fmt(runtime.timing.transaction_at)}</b></div><div className=\"col-span-2 rounded-2xl border border-slate-200 p-3\"><span className=\"text-slate-400\">التحقق</span><b className=\"mt-1 block text-slate-900\">{runtime.verification.verified_by_name ? `تحقق ${runtime.verification.verified_by_name}` : 'لم يسجل تحقق شخصي بعد'}</b>{runtime.verification.verified_at ? <span className=\"mt-1 block text-slate-500\">{fmt(runtime.verification.verified_at)}</span> : null}</div></div>
          </section>
        ) : null}

        <section className=\"rounded-3xl border border-slate-200 bg-white p-4 shadow-sm\" aria-label=\"إجراءات العملية\">
          <div className=\"mb-3\"><h2 className=\"text-sm font-black text-slate-900\">إجراءات العملية</h2><p className=\"mt-1 text-[10px] leading-5 text-slate-500\">هذه الإجراءات مرتبطة بهذه الصفحة فقط، ولن تبقى ظاهرة بعد الرجوع أو الانتقال إلى واجهة أخرى.</p></div>
          {action}
        </section>
      </section>,
      host,
    )}
"""

if ui.count(old_tail) != 1:
    raise SystemExit(f'UI tail replacement expected one match, found {ui.count(old_tail)}')
ui = ui.replace(old_tail, new_tail, 1)
ui_path.write_text(ui, encoding='utf-8')

worker_path = Path('supabase/functions/sanad-operation-preview-worker/index.ts')
worker = worker_path.read_text(encoding='utf-8')
worker = worker.replace('const PIPELINE_VERSION = "content-crop-v4";', 'const PIPELINE_VERSION = "content-crop-v5";', 1)

new_crop = r'''function detectReceiptCrop(image: Image): {
  crop: Bounds;
  page: Bounds;
  mode: string;
  layoutClass: string;
  confidence: number;
  edgeSafetyPassed: boolean;
} {
  const page = detectWhitePage(image);
  const bitmap = image.bitmap;
  const canvasWidth = image.width;
  const step = page.width > 1800 ? 4 : 3;
  const rowStep = Math.max(2, step);
  const minimumActivePixels = Math.max(3, Math.round(page.width / step * 0.003));
  const activeRows: number[] = [];
  let contentX0 = page.x + page.width - 1;
  let contentY0 = page.y + page.height - 1;
  let contentX1 = page.x;
  let contentY1 = page.y;
  let count = 0;

  // Scan the complete detected page. Previous versions scanned only the upper
  // 55%, which could cut off the lower half of a valid receipt.
  for (let y = page.y; y < page.y + page.height; y += rowStep) {
    let rowCount = 0;
    for (let x = page.x; x < page.x + page.width; x += step) {
      if (!hasContent(bitmap, canvasWidth, x, y)) continue;
      rowCount += 1;
      count += 1;
      contentX0 = Math.min(contentX0, x);
      contentY0 = Math.min(contentY0, y);
      contentX1 = Math.max(contentX1, x);
      contentY1 = Math.max(contentY1, y);
    }
    if (rowCount >= minimumActivePixels) activeRows.push(y);
  }

  const enoughContent = count >= Math.max(180, Math.round(page.width * page.height / 18000));
  if (!enoughContent || activeRows.length < 2 || contentX1 <= contentX0 || contentY1 <= contentY0) {
    return {
      crop: page,
      page,
      mode: "full-page-safe-fallback",
      layoutClass: "full_page_receipt",
      confidence: 0.55,
      edgeSafetyPassed: true,
    };
  }

  const contentWidth = contentX1 - contentX0 + 1;
  const widthRatio = contentWidth / page.width;
  const layoutClass = widthRatio >= 0.72 ? "full_width_receipt" : "centered_receipt";
  const horizontalPad = Math.max(14, Math.round(page.width * 0.018));
  const verticalPad = Math.max(18, Math.round(page.height * 0.022));

  let x = layoutClass === "full_width_receipt"
    ? page.x
    : Math.max(page.x, contentX0 - horizontalPad);
  let right = layoutClass === "full_width_receipt"
    ? page.x + page.width - 1
    : Math.min(page.x + page.width - 1, contentX1 + horizontalPad);
  let y = Math.max(page.y, contentY0 - verticalPad);
  let bottom = Math.min(page.y + page.height - 1, contentY1 + verticalPad);

  // Preserve a generous lower safety margin because receipt totals, signatures,
  // and beneficiary identifiers often sit below the last dense text row.
  bottom = Math.min(page.y + page.height - 1, bottom + Math.round(page.height * 0.035));

  let width = Math.max(1, right - x + 1);
  let height = Math.max(1, bottom - y + 1);
  const edgeProbe = Math.max(3, Math.round(Math.min(width, height) * 0.004));
  let edgeHits = 0;
  let probes = 0;

  for (let px = x; px < x + width; px += Math.max(5, step * 2)) {
    for (const py of [y + edgeProbe, y + height - 1 - edgeProbe]) {
      probes += 1;
      if (hasContent(bitmap, canvasWidth, px, py)) edgeHits += 1;
    }
  }
  for (let py = y; py < y + height; py += Math.max(5, step * 2)) {
    for (const px of [x + edgeProbe, x + width - 1 - edgeProbe]) {
      probes += 1;
      if (hasContent(bitmap, canvasWidth, px, py)) edgeHits += 1;
    }
  }

  const edgeSafetyPassed = probes === 0 || edgeHits / probes < 0.12;
  if (!edgeSafetyPassed) {
    x = page.x;
    y = page.y;
    width = page.width;
    height = page.height;
  }

  return {
    crop: { x, y, width, height },
    page,
    mode: edgeSafetyPassed ? "full-content-union" : "full-page-edge-safe-fallback",
    layoutClass,
    confidence: edgeSafetyPassed ? 0.94 : 0.78,
    edgeSafetyPassed,
  };
}

'''
pattern = re.compile(r'function detectReceiptCrop\(image: Image\): \{.*?\n\}\n\nasync function buildPdfPreview', re.S)
match = pattern.search(worker)
if not match:
    raise SystemExit('Preview crop function not found')
worker = worker[:match.start()] + new_crop + 'async function buildPdfPreview' + worker[match.end():]
worker_path.write_text(worker, encoding='utf-8')

print('Applied operation details v4, completion source fix, lifecycle cleanup, and preview crop v5.')
