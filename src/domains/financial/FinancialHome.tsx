import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  CircleDollarSign,
  FileCheck2,
  Landmark,
  Loader2,
  Plus,
  QrCode,
  ReceiptText,
  RefreshCw,
  WalletCards,
} from 'lucide-react';
import { getFinancialHome, type FinancialHomeContract, type PersonalFinanceActivityItem } from './personalFinanceApi';

interface FinancialHomeProps {
  onNavigate: (path: string) => void;
}

function formatMoney(value: number, currency: string): string {
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)} ${currency}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ar-YE', { month: 'short', day: 'numeric' }).format(date);
}

function activityLabel(item: PersonalFinanceActivityItem): string {
  if (item.description) return item.description;
  if (item.transaction_type === 'income') return 'دخل';
  if (item.transaction_type === 'expense') return 'مصروف';
  if (item.transaction_type === 'transfer') return 'تحويل بين الحسابات';
  if (item.transaction_type === 'adjustment') return 'تسوية مالية';
  return 'حركة مالية';
}

export default function FinancialHome({ onNavigate }: FinancialHomeProps) {
  const [data, setData] = useState<FinancialHomeContract | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setData(await getFinancialHome());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحميل الصفحة المالية حاليًا.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const hasLedger = Boolean(data?.accounts.length || data?.recent_activity.length);
  const monthLabel = useMemo(() => {
    if (!data?.period_start) return 'هذا الشهر';
    const date = new Date(data.period_start);
    return Number.isNaN(date.getTime())
      ? 'هذا الشهر'
      : new Intl.DateTimeFormat('ar-YE', { month: 'long', year: 'numeric' }).format(date);
  }, [data?.period_start]);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-5 pt-5" dir="rtl">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-[12px] font-bold text-emerald-700">سند المالي</p>
          <h1 className="text-[30px] font-black tracking-tight text-slate-950">المالي</h1>
          <p className="mt-1 max-w-md text-[13px] leading-6 text-slate-500">عملياتك، حساباتك، ومحاسبك الشخصي في مساحة واحدة.</p>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={refreshing}
          aria-label="تحديث البيانات المالية"
          className="mt-1 flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm active:scale-95 disabled:opacity-60"
        >
          {refreshing ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5" />}
        </button>
      </header>

      {loading ? (
        <div className="flex min-h-[52vh] items-center justify-center">
          <div className="text-center text-slate-500">
            <Loader2 className="mx-auto mb-3 h-7 w-7 animate-spin" />
            <p className="text-sm font-bold">جاري تجهيز ملخصك المالي…</p>
          </div>
        </div>
      ) : error ? (
        <section className="rounded-[28px] border border-rose-100 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-bold text-slate-900">تعذر تحميل البيانات المالية</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">{error}</p>
          <button type="button" onClick={() => void load()} className="mt-5 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white">إعادة المحاولة</button>
        </section>
      ) : data ? (
        <>
          <section className="mb-4 overflow-hidden rounded-[30px] bg-slate-950 p-5 text-white shadow-[0_18px_45px_rgba(15,23,42,0.12)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold text-emerald-300">ملخص {monthLabel}</p>
                <h2 className="mt-1 text-lg font-black">حركة أموالك</h2>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10"><CircleDollarSign className="h-5 w-5" /></div>
            </div>

            {data.summary_by_currency.length ? (
              <div className="space-y-3">
                {data.summary_by_currency.map((summary) => (
                  <div key={summary.currency} className="grid grid-cols-3 gap-2 rounded-2xl bg-white/[0.07] p-3">
                    <div><p className="text-[10px] text-slate-400">الدخل</p><p className="mt-1 text-[13px] font-black text-emerald-300">{formatMoney(summary.income, summary.currency)}</p></div>
                    <div><p className="text-[10px] text-slate-400">المصروف</p><p className="mt-1 text-[13px] font-black text-rose-300">{formatMoney(summary.expense, summary.currency)}</p></div>
                    <div><p className="text-[10px] text-slate-400">صافي الشهر</p><p className="mt-1 text-[13px] font-black">{formatMoney(summary.income - summary.expense, summary.currency)}</p></div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-2xl bg-white/[0.06] px-4 py-4 text-[13px] leading-6 text-slate-300">لا توجد قيود محاسبية مسجلة لهذا الشهر بعد. عمليات سند تبقى محفوظة كأدلة حتى تختار إدخالها في محاسبك الشخصي.</p>
            )}
          </section>

          <section className="mb-5 grid grid-cols-4 gap-2" aria-label="إجراءات مالية سريعة">
            <QuickAction icon={Plus} label="إضافة عملية" onClick={() => onNavigate('/financial/add')} />
            <QuickAction icon={QrCode} label="التحقق" onClick={() => onNavigate('/financial/verify')} />
            <QuickAction icon={ReceiptText} label="العمليات" onClick={() => onNavigate('/financial/operations')} />
            <QuickAction icon={BarChart3} label="التقارير" onClick={() => onNavigate('/financial/reports')} />
          </section>

          {data.unlinked_operations_count > 0 && (
            <button
              type="button"
              onClick={() => onNavigate('/financial/operations')}
              className="mb-5 flex w-full items-center justify-between gap-4 rounded-[24px] border border-emerald-100 bg-emerald-50/70 p-4 text-right"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-700 shadow-sm"><FileCheck2 className="h-5 w-5" /></div>
                <div>
                  <p className="text-sm font-black text-slate-900">{data.unlinked_operations_count} عملية سند خارج الدفتر الشخصي</p>
                  <p className="mt-1 text-[11px] leading-5 text-slate-500">راجع سجل العمليات أولًا. إدخال أي عملية إلى المحاسب سيكون قرارًا منفصلًا ولن يغيّر أصلها في سند.</p>
                </div>
              </div>
              <ArrowLeft className="h-5 w-5 shrink-0 text-emerald-700" />
            </button>
          )}

          <section className="mb-5 rounded-[28px] border border-slate-200/80 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-slate-400">المحاسب الشخصي</p>
                <h2 className="mt-1 text-[17px] font-black text-slate-950">حساباتي</h2>
              </div>
              <button type="button" onClick={() => onNavigate('/financial/accounts')} className="text-[12px] font-black text-emerald-700">إدارة الحسابات</button>
            </div>

            {data.accounts.length ? (
              <div className="space-y-2">
                {data.accounts.slice(0, 4).map((account) => (
                  <button key={account.id} type="button" onClick={() => onNavigate('/financial/accounting')} className="flex w-full items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-right">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-sm"><Landmark className="h-4 w-4" /></div>
                      <div><p className="text-[13px] font-black text-slate-900">{account.name}</p><p className="mt-0.5 text-[10px] text-slate-400">{account.account_type === 'liability' ? 'التزام' : 'أصل'} · {account.currency}</p></div>
                    </div>
                    <p className="text-[13px] font-black text-slate-900">{formatMoney(account.current_balance, account.currency)}</p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-sm"><WalletCards className="h-5 w-5" /></div>
                  <div><p className="text-[13px] font-black text-slate-900">ابدأ محاسبك الشخصي بحساب واحد</p><p className="mt-1 text-[11px] leading-5 text-slate-500">أضف نقدًا، حسابًا مصرفيًا أو التزامًا، ويمكنك إدخال رصيد افتتاحي من دون التأثير على عمليات التحقق.</p></div>
                </div>
                <button type="button" onClick={() => onNavigate('/financial/accounts')} className="mt-4 w-full rounded-2xl bg-slate-950 py-3 text-[12px] font-black text-white">إضافة أول حساب</button>
              </div>
            )}
          </section>

          <section className="rounded-[28px] border border-slate-200/80 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div><p className="text-[11px] font-bold text-slate-400">آخر القيود</p><h2 className="mt-1 text-[17px] font-black text-slate-950">الحركة المالية</h2></div>
              {hasLedger && <button type="button" onClick={() => onNavigate('/financial/accounting')} className="text-[12px] font-black text-emerald-700">عرض الكل</button>}
            </div>
            {data.recent_activity.length ? (
              <div className="divide-y divide-slate-100">
                {data.recent_activity.slice(0, 6).map((item) => {
                  const positive = item.transaction_type === 'income';
                  const negative = item.transaction_type === 'expense';
                  return (
                    <div key={item.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0"><p className="truncate text-[13px] font-bold text-slate-900">{activityLabel(item)}</p><p className="mt-1 text-[10px] text-slate-400">{formatDate(item.transaction_at)}{item.category_name ? ` · ${item.category_name}` : ''}</p></div>
                      <p className={`shrink-0 text-[13px] font-black ${positive ? 'text-emerald-700' : negative ? 'text-rose-600' : 'text-slate-700'}`}>{positive ? '+' : negative ? '−' : ''}{formatMoney(item.amount, item.currency)}</p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-5 text-center"><WalletCards className="mx-auto h-6 w-6 text-slate-300" /><p className="mt-2 text-[12px] font-bold text-slate-500">لا توجد حركة محاسبية بعد</p></div>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}

function QuickAction({ icon: Icon, label, onClick }: { icon: typeof Plus; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-[78px] flex-col items-center justify-center gap-2 rounded-[22px] border border-slate-200/80 bg-white px-1 py-3 text-slate-700 shadow-sm active:scale-[0.98]">
      <Icon className="h-[19px] w-[19px]" />
      <span className="text-center text-[10px] font-black leading-4">{label}</span>
    </button>
  );
}
