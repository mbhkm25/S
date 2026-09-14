import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertCircle, RefreshCw, WalletCards } from 'lucide-react';
import {
  getBusinessActivityTimeline,
  type BusinessActivityEvent
} from '../../lib/businessIntelligenceApi';
import { toLatinDigits } from '../../lib/digits';

interface Props {
  businessId: string;
}

function formatAmount(item: BusinessActivityEvent) {
  if (item.amount === null || item.amount === undefined) return null;
  const value = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(item.amount));
  return `${toLatinDigits(value)}${item.currency ? ` ${item.currency}` : ''}`;
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return toLatinDigits(new Intl.DateTimeFormat('ar-YE', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date));
}

function sourceLabel(source: string) {
  if (source === 'erp') return 'النظام المحاسبي';
  if (source === 'payment') return 'سند المالي';
  if (source === 'manual') return 'إدخال يدوي';
  return 'سند';
}

export default function BusinessActivityTimeline({ businessId }: Props) {
  const [items, setItems] = useState<BusinessActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const result = await getBusinessActivityTimeline(businessId, { limit: 50 });
      setItems(result.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحميل سجل نشاط النشاط التجاري.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex min-h-48 items-center justify-center gap-2 rounded-3xl border border-slate-200 bg-white text-xs font-bold text-slate-500">
        <RefreshCw className="h-4 w-4 animate-spin" />
        جارٍ تحميل النشاط…
      </div>
    );
  }

  return (
    <section className="space-y-3" dir="rtl" aria-labelledby="sanad-next-activity-title">
      <header className="flex items-start justify-between gap-3 px-1">
        <div>
          <span className="text-[10px] font-bold text-emerald-700">SANAD NEXT</span>
          <h2 id="sanad-next-activity-title" className="mt-0.5 text-base font-black text-slate-950">سجل النشاط</h2>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">أحداث النشاط القادمة من النظام المحاسبي وسند في خط زمني واحد قابل للتتبع.</p>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={refreshing}
          className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 disabled:opacity-50"
          aria-label="تحديث سجل النشاط"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-2xl border border-rose-100 bg-rose-50 p-3 text-xs leading-5 text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!error && items.length === 0 && (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <Activity className="mx-auto h-8 w-8 text-slate-300" />
          <strong className="mt-3 block text-sm text-slate-700">لا توجد أحداث بعد</strong>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">سيظهر أول حدث هنا بعد ربط النظام المحاسبي ونجاح أول مزامنة.</p>
        </div>
      )}

      <div className="space-y-2">
        {items.map((item) => {
          const amount = formatAmount(item);
          return (
            <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                  {item.source_kind === 'payment' ? <WalletCards className="h-4 w-4" /> : <Activity className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <strong className="block truncate text-sm text-slate-950">{item.title}</strong>
                      <span className="mt-1 block text-[10px] font-bold text-slate-400">{sourceLabel(item.source_kind)} · {formatDate(item.sort_at)}</span>
                    </div>
                    {amount && <strong className="shrink-0 text-sm text-slate-950">{amount}</strong>}
                  </div>

                  {item.party_name && (
                    <p className="mt-2 text-[11px] font-bold text-slate-700">{item.party_name}</p>
                  )}
                  {item.summary && (
                    <p className="mt-1 text-[11px] leading-5 text-slate-500">{item.summary}</p>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2 text-[9px] font-bold">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">{item.event_type}</span>
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">{item.status}</span>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
