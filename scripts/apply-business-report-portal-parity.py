from pathlib import Path

path = Path('src/components/business/reports/BusinessReportRequestSheet.tsx')
text = path.read_text(encoding='utf-8')

replacements = [
    (
        "import { useEffect, useMemo, useRef, useState } from 'react';\n",
        "import { useEffect, useMemo, useRef, useState } from 'react';\nimport { createPortal } from 'react-dom';\n",
    ),
    (
        "import { AlertCircle, Calendar, CheckCircle2, Loader2, Phone, X } from 'lucide-react';",
        "import { AlertCircle, Calendar, CheckCircle2, FileText, Files, Link2, Loader2, Phone, X } from 'lucide-react';",
    ),
    (
        "  type BusinessReportFilters\n} from '../../../lib/businessReportsApi';",
        "  type BusinessReportDeliveryFormat,\n  type BusinessReportFilters\n} from '../../../lib/businessReportsApi';",
    ),
    (
        "type ReportPeriod = 'today' | 'this_week' | 'this_month' | 'last_month' | 'last_30_days' | 'custom';\n",
        "type ReportPeriod = 'today' | 'this_week' | 'this_month' | 'last_month' | 'last_30_days' | 'custom';\n\nconst deliveryOptions: Array<{\n  value: BusinessReportDeliveryFormat;\n  title: string;\n  description: string;\n  recommended?: boolean;\n  icon: typeof Link2;\n}> = [\n  { value: 'interactive', title: 'رابط تفاعلي', description: 'الأفضل للجوال والبحث والتصفية وفتح تفاصيل العمليات.', recommended: true, icon: Link2 },\n  { value: 'pdf', title: 'ملف PDF', description: 'نسخة ثابتة مناسبة للحفظ والطباعة والمشاركة.', icon: FileText },\n  { value: 'both', title: 'الرابط + PDF', description: 'استلم النسخة التفاعلية والملف الثابت معًا.', icon: Files },\n];\n",
    ),
    (
        "  const [financialEntity, setFinancialEntity] = useState('ALL');\n",
        "  const [financialEntity, setFinancialEntity] = useState('ALL');\n  const [deliveryFormat, setDeliveryFormat] = useState<BusinessReportDeliveryFormat>('interactive');\n",
    ),
    (
        "        filters,\n        destinationPhone: `967${localPhone}`\n",
        "        filters,\n        destinationPhone: `967${localPhone}`,\n        deliveryFormat\n",
    ),
    (
        "      setSuccessMsg(\n        triggered\n          ? 'تم استلام الطلب، وسيصل التقرير إلى واتساب بعد اكتمال الإعداد.'\n          : 'تم حفظ الطلب، وقد تتأخر المعالجة قليلًا.'\n      );",
        "      const formatSuccess = deliveryFormat === 'pdf'\n        ? 'تم استلام الطلب. سيصلك ملف PDF عبر واتساب بعد اكتمال الإعداد.'\n        : deliveryFormat === 'both'\n          ? 'تم استلام الطلب. سيصلك رابط التقرير وملف PDF عبر واتساب بعد اكتمال الإعداد.'\n          : 'تم استلام الطلب. سيصلك رابط التقرير التفاعلي عبر واتساب بعد اكتمال الإعداد.';\n      setSuccessMsg(triggered ? formatSuccess : 'تم حفظ الطلب، وقد تتأخر المعالجة قليلًا.');",
    ),
    (
        "  return (\n    <div\n",
        "  return createPortal(\n    <div\n",
    ),
    (
        "            <section className=\"space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs\">\n              <p className=\"text-[10px] font-bold text-slate-600\">محتويات التقرير</p>",
        "            <section className=\"space-y-2\">\n              <div className=\"flex items-center justify-between gap-2\">\n                <label className=\"text-[11px] font-bold text-slate-700\">صيغة الاستلام</label>\n                <span className=\"text-[9px] text-slate-400\">نفس خيارات تقارير حسابك</span>\n              </div>\n              <div className=\"space-y-2\">\n                {deliveryOptions.map((option) => {\n                  const Icon = option.icon;\n                  const selected = deliveryFormat === option.value;\n                  return (\n                    <button\n                      key={option.value}\n                      type=\"button\"\n                      onClick={() => setDeliveryFormat(option.value)}\n                      className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-right transition ${selected ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-700'}`}\n                    >\n                      <span className={`mt-0.5 rounded-xl p-2 ${selected ? 'bg-white/10' : 'bg-white'}`}><Icon className=\"h-4 w-4\" /></span>\n                      <span className=\"min-w-0 flex-1\">\n                        <span className=\"flex items-center gap-2 text-xs font-bold\">{option.title}{option.recommended && <span className={`rounded-full px-2 py-0.5 text-[8px] ${selected ? 'bg-white/15 text-white' : 'bg-emerald-50 text-emerald-700'}`}>موصى به</span>}</span>\n                        <span className={`mt-1 block text-[9px] leading-4 ${selected ? 'text-slate-200' : 'text-slate-500'}`}>{option.description}</span>\n                      </span>\n                    </button>\n                  );\n                })}\n              </div>\n            </section>\n\n            <section className=\"space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs\">\n              <p className=\"text-[10px] font-bold text-slate-600\">محتويات التقرير</p>",
    ),
    (
        "    </div>\n  );\n}",
        "    </div>,\n    document.body\n  );\n}",
    ),
]

for old, new in replacements:
    if new in text:
        continue
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'Expected exactly one match, found {count}: {old[:100]!r}')
    text = text.replace(old, new, 1)

path.write_text(text, encoding='utf-8')
