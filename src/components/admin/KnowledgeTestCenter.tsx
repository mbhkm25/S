import { useState } from 'react';
import { FlaskConical, Loader2, Search, Sparkles } from 'lucide-react';
import { testKnowledgeSearch, type KnowledgeSearchResult } from '../../lib/knowledgeAdminApi';

interface Props {
  setError: (value: string | null) => void;
}

export default function KnowledgeTestCenter({ setError }: Props) {
  const [query, setQuery] = useState('أريد تثبيت تطبيق سند من فيسبوك');
  const [intent, setIntent] = useState('install_app');
  const [sourceCode, setSourceCode] = useState('');
  const [referenceUrl, setReferenceUrl] = useState('');
  const [channel, setChannel] = useState('whatsapp');
  const [audience, setAudience] = useState('new_user');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<KnowledgeSearchResult | null>(null);

  const runTest = async () => {
    if (!query.trim() && !sourceCode.trim() && !referenceUrl.trim()) return;
    setLoading(true);
    setError(null);
    try {
      setResult(await testKnowledgeSearch({
        query,
        intent,
        sourceCode,
        referenceUrl,
        channel,
        audience,
        limit: 6
      }));
    } catch {
      setError('تعذر تشغيل اختبار الاسترجاع. تحقق من الحقول وصلاحيات الإدارة.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-[1.8rem] bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-violet-700"><FlaskConical className="h-4 w-4" /><span className="text-[10px] font-bold">اختبار الاسترجاع</span></div>
          <h2 className="mt-2 text-sm font-bold text-slate-950">مركز اختبار معرفة المساعد</h2>
          <p className="mt-1 text-[10px] leading-5 text-slate-500">اختبر السؤال والنية والقناة قبل الاعتماد على المصدر في محادثات المستخدمين.</p>
        </div>
        <Sparkles className="h-5 w-5 text-slate-300" />
      </div>

      <div className="mt-4 space-y-3">
        <label className="block text-[10px] font-bold text-slate-600">سؤال المستخدم
          <textarea value={query} onChange={(event) => setQuery(event.target.value)} className="admin-input mt-2 min-h-24 resize-y" />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[10px] font-bold text-slate-600">النية
            <input dir="ltr" value={intent} onChange={(event) => setIntent(event.target.value)} className="admin-input mt-2 text-left" placeholder="install_app" />
          </label>
          <label className="text-[10px] font-bold text-slate-600">القناة
            <select value={channel} onChange={(event) => setChannel(event.target.value)} className="admin-input mt-2">
              <option value="whatsapp">WhatsApp</option>
              <option value="app">التطبيق</option>
              <option value="website">الموقع</option>
              <option value="facebook">Facebook</option>
            </select>
          </label>
          <label className="text-[10px] font-bold text-slate-600">الجمهور
            <input dir="ltr" value={audience} onChange={(event) => setAudience(event.target.value)} className="admin-input mt-2 text-left" placeholder="new_user" />
          </label>
          <label className="text-[10px] font-bold text-slate-600">كود المصدر
            <input dir="ltr" value={sourceCode} onChange={(event) => setSourceCode(event.target.value.toUpperCase())} className="admin-input mt-2 text-left font-mono" placeholder="FB-INSTALL-001" />
          </label>
        </div>
        <label className="block text-[10px] font-bold text-slate-600">رابط مرجعي
          <input dir="ltr" value={referenceUrl} onChange={(event) => setReferenceUrl(event.target.value)} className="admin-input mt-2 text-left" placeholder="https://facebook.com/..." />
        </label>
        <button type="button" onClick={() => void runTest()} disabled={loading || (!query.trim() && !sourceCode.trim() && !referenceUrl.trim())} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-700 text-xs font-bold text-white disabled:opacity-40">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          تشغيل الاختبار
        </button>
      </div>

      {result && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xs font-bold text-slate-900">النتائج المسترجعة</h3>
            <span className="rounded-lg bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-500">{result.items.length} نتيجة</span>
          </div>
          <div className="mt-3 space-y-2">
            {result.items.map((item, index) => (
              <article key={`${item.unit_id || item.source_id}-${index}`} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[9px] font-bold text-violet-700">#{index + 1} · {item.source_code}</p>
                    <h4 className="mt-1 text-[11px] font-bold text-slate-900">{item.heading || item.title}</h4>
                  </div>
                  <div className="text-left">
                    <p className="font-mono text-[9px] text-slate-500">score {Number(item.score || 0).toFixed(2)}</p>
                    <p className="mt-1 text-[9px] text-slate-400">سلطة {item.authority_level}</p>
                  </div>
                </div>
                <p className="mt-2 line-clamp-4 text-[10px] leading-5 text-slate-600">{item.content}</p>
                {item.primary_cta_url && <p dir="ltr" className="mt-2 break-all text-left font-mono text-[9px] text-emerald-700">{item.primary_cta_url}</p>}
              </article>
            ))}
            {!result.items.length && <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-[10px] text-slate-500">لم يعثر النظام على مصدر منشور مطابق. هذه حالة fallback ينبغي مراجعتها قبل الإطلاق.</div>}
          </div>
        </div>
      )}
    </section>
  );
}
