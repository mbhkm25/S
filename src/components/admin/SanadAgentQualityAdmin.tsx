import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  FlaskConical,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react';
import {
  getAdminAgentEvalOverview,
  runAdminAgentGoldenEval,
  type AdminAgentEvalOverview,
  type AdminAgentEvalRun,
} from '../../lib/platformAdminApi';

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  hour12: true,
});

function formatDate(value?: string | null) {
  return value ? dateFormat.format(new Date(value)) : '—';
}

function gateLabel(run?: AdminAgentEvalRun | null) {
  if (!run) return 'لا يوجد تشغيل بعد';
  if (run.status === 'running') return 'قيد التشغيل';
  return run.release_gate_passed ? 'Release Gate ناجح' : 'Release Gate غير ناجح';
}

function failureLabel(item: Record<string, unknown>) {
  const type = String(item.type || 'failure');
  const labels: Record<string, string> = {
    missing_tool: 'أداة مطلوبة لم تُستخدم',
    unexpected_tool: 'استخدام أداة غير متوقعة',
    forbidden_tool: 'استخدام أداة ممنوعة',
    too_many_tools: 'عدد أدوات أعلى من الحد',
    missing_text: 'نص مطلوب غير موجود',
    forbidden_text: 'نص ممنوع ظهر في الإجابة',
    latency: 'زمن الاستجابة تجاوز الحد',
    scope: 'نطاق الإجابة غير صحيح',
    clarification_required: 'كان يجب طلب توضيح',
    period_required: 'الفترة غير ظاهرة',
    currency_separation: 'فصل العملات غير مؤكد',
    currency_count: 'عدد العملات أقل من المتوقع',
    tool_argument: 'وسيط الأداة غير صحيح',
  };
  return labels[type] || type;
}

export default function SanadAgentQualityAdmin({
  setError,
  setSuccess,
}: {
  setError: (value: string | null) => void;
  setSuccess: (value: string | null) => void;
}) {
  const [overview, setOverview] = useState<AdminAgentEvalOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [model, setModel] = useState<'gemini-3.8-flash' | 'gemini-3.1-pro-preview'>('gemini-3.8-flash');

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      setOverview(await getAdminAgentEvalOverview(20));
    } catch {
      setError('تعذر تحميل مؤشرات جودة مساعد سند.');
    } finally {
      setLoading(false);
    }
  }, [setError]);

  useEffect(() => { void load(); }, [load]);

  const latest = overview?.runs?.[0] || null;
  const passRate = Number(latest?.pass_rate || 0);

  const averageLatency = useMemo(() => {
    const rows = overview?.latest_results || [];
    const values = rows.map((row) => Number(row.latency_ms || 0)).filter((value) => value > 0 && value < 2_000_000_000);
    if (!values.length) return 0;
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  }, [overview?.latest_results]);

  const runEval = async () => {
    if (running) return;
    setRunning(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await runAdminAgentGoldenEval(model);
      setSuccess(
        result.gate.release_gate_passed
          ? `اكتمل Golden Eval بنجاح: ${nf.format(result.gate.pass_rate)}%، دون إخفاقات حرجة.`
          : `اكتمل Golden Eval، لكن Release Gate لم ينجح: ${nf.format(result.gate.pass_rate)}%، إخفاقات حرجة ${result.gate.critical_failures}.`
      );
      await load(true);
    } catch {
      setError('تعذر تشغيل Golden Eval. راجع اتصال النموذج وسجل الوظيفة ثم أعد المحاولة.');
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-[45vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-slate-400" /></div>;
  }

  return (
    <section className="space-y-4" dir="rtl">
      <div className="overflow-hidden rounded-[1.8rem] bg-slate-950 p-5 text-white shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10">
              <Sparkles className="h-6 w-6 text-indigo-200" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-black">جودة مساعد سند</h2>
                <span className="rounded-full bg-emerald-400/15 px-2 py-1 text-[9px] font-black text-emerald-200">
                  Golden Agent Evals
                </span>
              </div>
              <p className="mt-1 max-w-2xl text-[10px] leading-5 text-slate-300">
                اختبار حي للنموذج والأدوات والـVerifier باستخدام Fixtures صناعية. لا تُقرأ بيانات عملاء أو أرصدة حقيقية أثناء هذا الاختبار.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={model}
              onChange={(event) => setModel(event.target.value as typeof model)}
              disabled={running}
              className="h-10 rounded-xl border border-white/15 bg-white/10 px-3 text-[10px] font-bold text-white outline-none"
              aria-label="نموذج التقييم"
            >
              <option className="text-slate-950" value="gemini-3.8-flash">gemini-3.8-flash — Production</option>
              <option className="text-slate-950" value="gemini-3.1-pro-preview">gemini-3.1-pro-preview — Shadow</option>
            </select>
            <button
              type="button"
              onClick={() => void runEval()}
              disabled={running}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-[10px] font-black text-slate-950 disabled:opacity-50"
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
              {running ? 'تشغيل الاختبارات…' : 'تشغيل Golden Eval'}
            </button>
            <button
              type="button"
              onClick={() => void load(true)}
              disabled={running}
              aria-label="تحديث الجودة"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {[
          ['الحالات', overview?.suite.total_cases ?? 0],
          ['الحرجة', overview?.suite.critical_cases ?? 0],
          ['Strict tools', overview?.suite.strict_cases ?? 0],
          ['Pass rate', latest ? `${nf.format(passRate)}%` : '—'],
          ['Critical failures', latest?.critical_failures ?? '—'],
          ['متوسط الزمن', averageLatency ? `${nf.format(averageLatency / 1000)} ث` : '—'],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[9px] font-bold text-slate-400">{label}</p>
            <p className="mt-2 text-xl font-black text-slate-950">{value}</p>
          </div>
        ))}
      </div>

      <div className={`rounded-2xl border p-4 ${
        latest?.release_gate_passed
          ? 'border-emerald-100 bg-emerald-50'
          : latest
            ? 'border-amber-100 bg-amber-50'
            : 'border-slate-200 bg-white'
      }`}>
        <div className="flex items-start gap-3">
          {latest?.release_gate_passed
            ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
            : latest
              ? <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
              : <ShieldCheck className="mt-0.5 h-5 w-5 text-slate-400" />}
          <div className="min-w-0 flex-1">
            <h3 className="text-xs font-black text-slate-900">{gateLabel(latest)}</h3>
            {latest ? (
              <p className="mt-1 text-[10px] leading-5 text-slate-600">
                {latest.assistant_version} · {latest.runner_version || 'runner'} · {formatDate(latest.completed_at || latest.created_at)}
              </p>
            ) : (
              <p className="mt-1 text-[10px] leading-5 text-slate-500">لم يتم تشغيل Agent Golden Suite من لوحة الإدارة بعد.</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,.75fr)]">
        <section className="rounded-[1.6rem] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-black text-slate-900">نتائج آخر تشغيل</h3>
              <p className="mt-1 text-[9px] text-slate-400">الأداة، الزمن، ونوع الإخفاق لكل حالة.</p>
            </div>
            <Bot className="h-5 w-5 text-slate-300" />
          </div>

          <div className="mt-4 space-y-2">
            {(overview?.latest_results || []).map((item) => (
              <details key={item.case_key} className={`rounded-2xl border px-3 py-3 ${
                item.passed ? 'border-emerald-100 bg-emerald-50/50' : 'border-rose-100 bg-rose-50/60'
              }`}>
                <summary className="cursor-pointer list-none">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2">
                      {item.passed
                        ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />}
                      <div className="min-w-0">
                        <p className="text-[10px] font-black text-slate-800">{item.title}</p>
                        <p className="mt-1 text-[8px] text-slate-400">{item.case_key} · {item.severity}</p>
                      </div>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1 text-[8px] font-bold text-slate-400">
                      <Clock3 className="h-3 w-3" /> {item.latency_ms ? `${nf.format(item.latency_ms / 1000)} ث` : '—'}
                    </span>
                  </div>
                </summary>
                <div className="mt-3 space-y-2 border-t border-black/5 pt-3">
                  <div className="flex flex-wrap gap-1">
                    {(item.actual_tool_names || []).map((tool) => (
                      <span key={tool} className="rounded-full bg-white px-2 py-1 text-[8px] font-bold text-slate-600">{tool}</span>
                    ))}
                    {!item.actual_tool_names?.length && <span className="text-[8px] text-slate-400">دون أدوات</span>}
                  </div>
                  {!item.passed && item.failures?.length ? (
                    <ul className="space-y-1">
                      {item.failures.map((failure, index) => (
                        <li key={index} className="text-[9px] font-bold text-rose-700">• {failureLabel(failure)}</li>
                      ))}
                    </ul>
                  ) : null}
                  {item.actual_response ? (
                    <p className="rounded-xl bg-white/80 p-3 text-[9px] leading-5 text-slate-600">{item.actual_response}</p>
                  ) : null}
                </div>
              </details>
            ))}
            {!overview?.latest_results?.length && (
              <div className="rounded-2xl border border-dashed border-slate-200 p-7 text-center text-[10px] text-slate-400">
                شغّل Golden Eval لعرض النتائج هنا.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-[1.6rem] border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-xs font-black text-slate-900">آخر التشغيلات</h3>
          <div className="mt-4 space-y-2">
            {(overview?.runs || []).slice(0, 10).map((run) => (
              <div key={run.id} className="rounded-2xl bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[9px] font-black text-slate-800">{run.assistant_version}</p>
                    <p className="mt-1 text-[8px] text-slate-400">{formatDate(run.created_at)}</p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[8px] font-black ${
                    run.release_gate_passed ? 'bg-emerald-100 text-emerald-700' : run.status === 'running' ? 'bg-sky-100 text-sky-700' : 'bg-rose-100 text-rose-700'
                  }`}>
                    {run.release_gate_passed ? 'PASS' : run.status.toUpperCase()}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div><p className="text-sm font-black">{run.pass_rate == null ? '—' : `${nf.format(run.pass_rate)}%`}</p><p className="text-[7px] text-slate-400">Pass</p></div>
                  <div><p className="text-sm font-black">{run.failed_cases}</p><p className="text-[7px] text-slate-400">Failed</p></div>
                  <div><p className="text-sm font-black">{run.critical_failures}</p><p className="text-[7px] text-slate-400">Critical</p></div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" />
          <div>
            <h3 className="text-[10px] font-black text-sky-950">لا توجد ترقية تلقائية للنموذج</h3>
            <p className="mt-1 text-[9px] leading-5 text-sky-800">
              نجاح Release Gate يثبت الجاهزية وفق مجموعة الاختبارات الحالية فقط. الانتقال إلى Canary أو Production يبقى قرارًا منفصلًا بعد مراجعة النتائج.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
