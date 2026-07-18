import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { AlertCircle, Calendar, CheckCircle2, Loader2, Phone, X } from 'lucide-react';
import {
  getBusinessTeam,
  type BusinessOperationItem,
  type BusinessProfile,
  type BusinessTeamMember
} from '../../../lib/businessApi';
import {
  createBusinessReportRequest,
  triggerBusinessReportProcessing,
  type BusinessReportFilters
} from '../../../lib/businessReportsApi';
import { parseYemeniLocalPhone, toLatinDigits } from '../../../lib/digits';

type ReportPeriod = 'today' | 'this_week' | 'this_month' | 'last_month' | 'last_30_days' | 'custom';

type DateRange = { from: string | null; to: string | null };

function getAdenDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Aden',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    numberingSystem: 'latn'
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value || 0);
  return { year: value('year'), month: value('month'), day: value('day') };
}

function adenDayRange(year: number, month: number, day: number) {
  const startMs = Date.UTC(year, month - 1, day) - 3 * 60 * 60 * 1000;
  return {
    from: new Date(startMs).toISOString(),
    to: new Date(startMs + 24 * 60 * 60 * 1000 - 1).toISOString()
  };
}

interface BusinessReportRequestSheetProps {
  business: BusinessProfile;
  operations: BusinessOperationItem[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function BusinessReportRequestSheet({
  business,
  operations,
  onClose,
  onSuccess
}: BusinessReportRequestSheetProps) {
  const [period, setPeriod] = useState<ReportPeriod>('last_30_days');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [currency, setCurrency] = useState<BusinessReportFilters['currency']>('ALL');
  const [status, setStatus] = useState<BusinessReportFilters['status']>('all');
  const [teamMemberId, setTeamMemberId] = useState('ALL');
  const [financialEntity, setFinancialEntity] = useState('ALL');
  const [includeDetails, setIncludeDetails] = useState(true);
  const [includeTeamPerformance, setIncludeTeamPerformance] = useState(true);
  const [includeStatusDistribution, setIncludeStatusDistribution] = useState(true);
  const [includeCurrencyDistribution, setIncludeCurrencyDistribution] = useState(true);
  const [includeEntityDistribution, setIncludeEntityDistribution] = useState(true);
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [team, setTeam] = useState<BusinessTeamMember[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const submissionLock = useRef(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (business.whatsapp) {
      setWhatsappPhone(parseYemeniLocalPhone(toLatinDigits(business.whatsapp)));
    }
  }, [business.whatsapp]);

  useEffect(() => {
    let active = true;
    const loadTeam = async () => {
      setLoadingTeam(true);
      try {
        const members = await getBusinessTeam(business.id);
        if (active) setTeam(members || []);
      } catch (error) {
        console.warn('Failed to load business team:', error);
      } finally {
        if (active) setLoadingTeam(false);
      }
    };
    void loadTeam();
    return () => {
      active = false;
    };
  }, [business.id]);

  const financialEntities = useMemo(() => {
    const values = new Set<string>();
    operations.forEach((item) => {
      const value = item.operation?.financial_entity?.trim();
      if (value) values.add(value);
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [operations]);

  const calculateDates = (): DateRange => {
    const today = getAdenDateParts();
    const todayUtc = new Date(Date.UTC(today.year, today.month - 1, today.day));
    const todayRange = adenDayRange(today.year, today.month, today.day);
    const rangeForUtcDate = (value: Date) =>
      adenDayRange(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());

    if (period === 'today') return todayRange;
    if (period === 'this_week') {
      const daysSinceSaturday = (todayUtc.getUTCDay() + 1) % 7;
      const start = new Date(todayUtc.getTime() - daysSinceSaturday * 86400000);
      return { from: rangeForUtcDate(start).from, to: todayRange.to };
    }
    if (period === 'this_month') {
      return { from: adenDayRange(today.year, today.month, 1).from, to: todayRange.to };
    }
    if (period === 'last_month') {
      const start = new Date(Date.UTC(today.year, today.month - 2, 1));
      const end = new Date(Date.UTC(today.year, today.month - 1, 0));
      return { from: rangeForUtcDate(start).from, to: rangeForUtcDate(end).to };
    }
    if (period === 'last_30_days') {
      const start = new Date(todayUtc.getTime() - 29 * 86400000);
      return { from: rangeForUtcDate(start).from, to: todayRange.to };
    }
    if (!customFrom) return { from: null, to: null };
    const [fromYear, fromMonth, fromDay] = customFrom.split('-').map(Number);
    const [toYear, toMonth, toDay] = (customTo || customFrom).split('-').map(Number);
    return {
      from: adenDayRange(fromYear, fromMonth, fromDay).from,
      to: adenDayRange(toYear, toMonth, toDay).to
    };
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting || submissionLock.current) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    const localPhone = parseYemeniLocalPhone(whatsappPhone.trim());
    if (!/^7\d{8}$/.test(localPhone)) {
      setErrorMsg('أدخل رقم واتساب يمنيًا محليًا من 9 أرقام، مثل 777634971.');
      return;
    }

    const { from, to } = calculateDates();
    if (period === 'custom' && !from) {
      setErrorMsg('اختر تاريخ بداية الفترة المخصصة.');
      return;
    }
    if (from && to && new Date(from) > new Date(to)) {
      setErrorMsg('تاريخ نهاية الفترة يجب ألا يسبق تاريخ البداية.');
      return;
    }

    submissionLock.current = true;
    setSubmitting(true);
    try {
      const filters: Partial<BusinessReportFilters> = {
        currency,
        status,
        team_member_user_id: teamMemberId === 'ALL' ? null : teamMemberId,
        financial_entity: financialEntity === 'ALL' ? null : financialEntity,
        include_details: includeDetails,
        include_team_performance: includeTeamPerformance,
        include_status_distribution: includeStatusDistribution,
        include_currency_distribution: includeCurrencyDistribution,
        include_entity_distribution: includeEntityDistribution
      };
      const reportRequestId = await createBusinessReportRequest({
        businessId: business.id,
        dateFrom: from,
        dateTo: to,
        filters,
        destinationPhone: `967${localPhone}`
      });
      const triggered = await triggerBusinessReportProcessing(reportRequestId);
      setSuccessMsg(
        triggered
          ? 'تم استلام الطلب، وسيصل التقرير إلى واتساب بعد اكتمال الإعداد.'
          : 'تم حفظ الطلب، وقد تتأخر المعالجة قليلًا.'
      );
      window.setTimeout(onSuccess, 1600);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'تعذر إنشاء التقرير. تحقق من الاتصال ثم أعد المحاولة.');
    } finally {
      submissionLock.current = false;
      setSubmitting(false);
    }
  };

  const periods: Array<{ id: ReportPeriod; label: string }> = [
    { id: 'today', label: 'اليوم' },
    { id: 'this_week', label: 'هذا الأسبوع' },
    { id: 'this_month', label: 'هذا الشهر' },
    { id: 'last_month', label: 'الشهر الماضي' },
    { id: 'last_30_days', label: 'آخر 30 يومًا' },
    { id: 'custom', label: 'فترة مخصصة' }
  ];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/60 font-arabic backdrop-blur-sm sm:items-center sm:p-4"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="business-report-sheet-title"
    >
      <button className="absolute inset-0 cursor-default" onClick={onClose} aria-label="إغلاق النافذة" />
      <section className="relative z-10 flex h-[min(92dvh,760px)] w-full min-h-0 flex-col overflow-hidden rounded-t-[28px] border border-slate-200 bg-white shadow-2xl sm:h-auto sm:max-h-[88dvh] sm:max-w-lg sm:rounded-[28px]">
        <div className="mx-auto mt-2 h-1.5 w-12 shrink-0 rounded-full bg-slate-200 sm:hidden" />
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-4 py-4">
          <div>
            <h2 id="business-report-sheet-title" className="text-sm font-bold text-slate-950">إعداد التقرير</h2>
            <p className="mt-1 text-[10px] leading-5 text-slate-500">حدد الفترة والمحتوى، ثم أرسل الطلب إلى واتساب.</p>
          </div>
          <button onClick={onClose} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" aria-label="إغلاق">
            <X className="h-4 w-4" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4 [scrollbar-gutter:stable]">
            {errorMsg && <div className="flex gap-2 rounded-2xl border border-rose-100 bg-rose-50 p-3 text-xs text-rose-700"><AlertCircle className="h-4 w-4 shrink-0" /><span>{errorMsg}</span></div>}
            {successMsg && <div className="flex gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-700"><CheckCircle2 className="h-4 w-4 shrink-0" /><span>{successMsg}</span></div>}

            <section className="space-y-2">
              <label className="text-[11px] font-bold text-slate-700">الفترة الزمنية</label>
              <div className="grid grid-cols-3 gap-2">
                {periods.map((item) => (
                  <button key={item.id} type="button" onClick={() => setPeriod(item.id)} className={`rounded-xl border px-2 py-2.5 text-[10px] font-bold ${period === item.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                    {item.label}
                  </button>
                ))}
              </div>
              {period === 'custom' && (
                <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <label className="space-y-1 text-[9px] font-bold text-slate-500"><span className="flex items-center gap-1"><Calendar className="h-3 w-3" />البداية</span><input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs" /></label>
                  <label className="space-y-1 text-[9px] font-bold text-slate-500"><span className="flex items-center gap-1"><Calendar className="h-3 w-3" />النهاية</span><input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs" /></label>
                </div>
              )}
            </section>

            <section className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-[10px] font-bold text-slate-600">العملة<select value={currency} onChange={(e) => setCurrency(e.target.value as BusinessReportFilters['currency'])} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs"><option value="ALL">كل العملات</option><option value="YER">YER</option><option value="SAR">SAR</option><option value="USD">USD</option></select></label>
              <label className="space-y-1 text-[10px] font-bold text-slate-600">الحالة<select value={status} onChange={(e) => setStatus(e.target.value as BusinessReportFilters['status'])} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs"><option value="all">كل الحالات</option><option value="verified">موثق</option><option value="ready">جاهز</option><option value="stored">مخزن</option><option value="received">مستلم</option><option value="matched">مطابق</option><option value="failed">فاشل</option></select></label>
              <label className="space-y-1 text-[10px] font-bold text-slate-600">عضو الفريق<select value={teamMemberId} onChange={(e) => setTeamMemberId(e.target.value)} disabled={loadingTeam} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs disabled:opacity-50"><option value="ALL">الكل</option>{team.map((member) => <option key={member.user_id} value={member.user_id}>{member.profile?.full_name || member.profile?.phone || 'عضو فريق'}</option>)}</select></label>
              <label className="space-y-1 text-[10px] font-bold text-slate-600">الجهة المالية<select value={financialEntity} onChange={(e) => setFinancialEntity(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs"><option value="ALL">كل الجهات</option>{financialEntities.map((entity) => <option key={entity} value={entity}>{entity}</option>)}</select></label>
            </section>

            <section className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs">
              <p className="text-[10px] font-bold text-slate-600">محتويات التقرير</p>
              {[
                ['التفاصيل', includeDetails, setIncludeDetails],
                ['أداء الفريق', includeTeamPerformance, setIncludeTeamPerformance],
                ['توزيع الحالات', includeStatusDistribution, setIncludeStatusDistribution],
                ['توزيع العملات', includeCurrencyDistribution, setIncludeCurrencyDistribution],
                ['توزيع الجهات', includeEntityDistribution, setIncludeEntityDistribution]
              ].map(([label, checked, setter]) => (
                <label key={String(label)} className="flex items-center gap-2"><input type="checkbox" checked={Boolean(checked)} onChange={(e) => (setter as (value: boolean) => void)(e.target.checked)} className="accent-slate-900" /><span>{String(label)}</span></label>
              ))}
            </section>

            <label className="space-y-1 text-[10px] font-bold text-slate-600"><span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />رقم واتساب المستلم</span><div className="flex overflow-hidden rounded-2xl border border-slate-200 bg-slate-50" dir="ltr"><span className="border-r border-slate-200 bg-slate-100 px-3 py-3 font-mono text-xs">+967</span><input type="tel" value={whatsappPhone} onChange={(e) => setWhatsappPhone(parseYemeniLocalPhone(e.target.value).slice(0, 9))} placeholder="7XXXXXXXX" maxLength={9} className="min-w-0 flex-1 bg-transparent px-3 font-mono text-xs outline-none" /></div></label>
          </div>

          <footer className="shrink-0 border-t border-slate-100 bg-white px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(15,23,42,0.06)]">
            <div className="grid grid-cols-[auto_1fr] gap-2">
              <button type="button" onClick={onClose} className="rounded-2xl border border-slate-200 px-4 py-3 text-xs font-bold text-slate-600">إلغاء</button>
              <button type="submit" disabled={submitting} className="flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-xs font-bold text-white disabled:bg-slate-300">{submitting && <Loader2 className="h-4 w-4 animate-spin" />}{submitting ? 'جاري إرسال الطلب...' : 'إرسال طلب التقرير'}</button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  );
}
