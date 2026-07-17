import { useRef, useState, useEffect, useMemo } from 'react';
import type { FormEvent } from 'react';
import { X, Calendar, Phone, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { getBusinessTeam, type BusinessProfile, type BusinessTeamMember, type BusinessOperationItem } from '../../../lib/businessApi';
import { createBusinessReportRequest, triggerBusinessReportProcessing, type BusinessReportFilters } from '../../../lib/businessReportsApi';
import { parseYemeniLocalPhone, toLatinDigits } from '../../../lib/digits';

type ReportPeriod = 'today' | 'this_week' | 'this_month' | 'last_month' | 'last_30_days' | 'custom';

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
  // Form states
  const [period, setPeriod] = useState<ReportPeriod>('last_30_days');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  
  const [currency, setCurrency] = useState<'ALL' | 'YER' | 'SAR' | 'USD'>('ALL');
  const [status, setStatus] = useState<BusinessReportFilters['status']>('all');
  const [teamMemberId, setTeamMemberId] = useState<string>('ALL');
  const [financialEntity, setFinancialEntity] = useState<string>('ALL');
  
  // Content toggles
  const [includeDetails, setIncludeDetails] = useState(true);
  const [includeTeamPerformance, setIncludeTeamPerformance] = useState(true);
  const [includeStatusDistribution, setIncludeStatusDistribution] = useState(true);
  const [includeCurrencyDistribution, setIncludeCurrencyDistribution] = useState(true);
  const [includeEntityDistribution, setIncludeEntityDistribution] = useState(true);
  
  // Delivery WhatsApp
  const [whatsappPhone, setWhatsappPhone] = useState('');
  
  // Team loading
  const [team, setTeam] = useState<BusinessTeamMember[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(false);
  
  // Request execution states
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const submissionLock = useRef(false);

  // Set default WhatsApp phone from business
  useEffect(() => {
    if (business?.whatsapp) {
      setWhatsappPhone(parseYemeniLocalPhone(toLatinDigits(business.whatsapp)));
    }
  }, [business]);

  // Load team members
  useEffect(() => {
    const loadTeam = async () => {
      if (!business?.id) return;
      setLoadingTeam(true);
      try {
        const members = await getBusinessTeam(business.id);
        setTeam(members || []);
      } catch (err) {
        console.warn('Failed to load business team:', err);
      } finally {
        setLoadingTeam(false);
      }
    };
    loadTeam();
  }, [business?.id]);

  // Financial entities unique list from operations
  const financialEntities = useMemo(() => {
    const entities = new Set<string>();
    operations.forEach((opItem) => {
      const ent = opItem.operation?.financial_entity;
      if (ent) entities.add(ent);
    });
    return Array.from(entities);
  }, [operations]);

  // Calculate standard date range ISO strings
  const calculateDates = () => {
    const today = getAdenDateParts();
    const todayUtc = new Date(Date.UTC(today.year, today.month - 1, today.day));
    const rangeForUtcDate = (value: Date) =>
      adenDayRange(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
    const todayRange = adenDayRange(today.year, today.month, today.day);
    switch (period) {
      case 'today':
        return todayRange;
      case 'this_week': {
        const daysSinceSaturday = (todayUtc.getUTCDay() + 1) % 7;
        const start = new Date(todayUtc.getTime() - daysSinceSaturday * 86400000);
        return { from: rangeForUtcDate(start).from, to: todayRange.to };
      }
      case 'this_month':
        return { from: adenDayRange(today.year, today.month, 1).from, to: todayRange.to };
      case 'last_month': {
        const start = new Date(Date.UTC(today.year, today.month - 2, 1));
        const end = new Date(Date.UTC(today.year, today.month - 1, 0));
        return { from: rangeForUtcDate(start).from, to: rangeForUtcDate(end).to };
      }
      case 'last_30_days': {
        const start = new Date(todayUtc.getTime() - 29 * 86400000);
        return { from: rangeForUtcDate(start).from, to: todayRange.to };
      }
      case 'custom': {
        if (!customFrom) return { from: null, to: null };
        const [fromYear, fromMonth, fromDay] = customFrom.split('-').map(Number);
        const endValue = customTo || customFrom;
        const [toYear, toMonth, toDay] = endValue.split('-').map(Number);
        return {
          from: adenDayRange(fromYear, fromMonth, fromDay).from,
          to: adenDayRange(toYear, toMonth, toDay).to
        };
      }
      default:
        return { from: null, to: null };
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting || submissionLock.current) return;

    setErrorMsg(null);
    setSuccessMsg(null);

    // Validate phone
    const cleanedPhone = parseYemeniLocalPhone(whatsappPhone.trim());
    if (!cleanedPhone) {
      setErrorMsg('يرجى إدخال رقم واتساب مستلم.');
      return;
    }
    if (!/^7\d{8}$/.test(cleanedPhone)) {
      setErrorMsg('رقم الهاتف المحلي اليمني يجب أن يتكون من 9 أرقام بالضبط (مثال: 777634971).');
      return;
    }
    const destinationPhone = `967${cleanedPhone}`;

    const { from, to } = calculateDates();
    if (period === 'custom' && !from) {
      setErrorMsg('يرجى اختيار تاريخ بدء الفترة المخصصة.');
      return;
    }
    if (from && to && new Date(from) > new Date(to)) {
      setErrorMsg('تاريخ نهاية الفترة يجب ألا يسبق تاريخ البداية.');
      return;
    }

    submissionLock.current = true;
    setSubmitting(true);

    try {
      const filtersPayload: Partial<BusinessReportFilters> = {
        currency,
        status: status === 'all' ? 'all' : status,
        team_member_user_id: teamMemberId === 'ALL' ? null : teamMemberId,
        financial_entity: financialEntity === 'ALL' ? null : financialEntity,
        include_details: includeDetails,
        include_team_performance: includeTeamPerformance,
        include_status_distribution: includeStatusDistribution,
        include_currency_distribution: includeCurrencyDistribution,
        include_entity_distribution: includeEntityDistribution
      };

      // Create Request
      const reportRequestId = await createBusinessReportRequest({
        businessId: business.id,
        dateFrom: from,
        dateTo: to,
        filters: filtersPayload,
        destinationPhone
      });

      // Trigger Webhook Function
      const triggerSuccess = await triggerBusinessReportProcessing(reportRequestId);

      if (triggerSuccess) {
        setSuccessMsg('تم استلام طلب التقرير، وسيصل إلى واتساب بعد اكتمال الإعداد.');
      } else {
        setSuccessMsg('تم حفظ طلب التقرير، وقد تتأخر المعالجة قليلًا.');
      }

      setTimeout(() => {
        onSuccess();
      }, 2000);
    } catch (err: unknown) {
      console.error(err);
      setErrorMsg(err instanceof Error ? err.message : 'تعذر معالجة طلب التقرير. تأكد من اتصال الشبكة.');
    } finally {
      submissionLock.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs font-arabic animate-fade-in" dir="rtl">
      {/* Container */}
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl border border-slate-200/80 shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[85vh] overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="p-4.5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="text-right">
            <h3 className="text-sm font-bold text-slate-900">طلب تقرير جديد</h3>
            <p className="text-[10px] text-slate-400">حدد الفترة والفلاتر، وسيتم إرسال التقرير إلى واتساب.</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-50 border border-slate-200 rounded-xl transition-all"
          >
            <X className="w-4 h-4 text-slate-450" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 text-right flex-1">
          {/* Alerts */}
          {errorMsg && (
            <div className="flex items-start gap-2.5 text-xs text-rose-600 bg-rose-50 p-3 rounded-2xl border border-rose-100 leading-relaxed">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="flex items-start gap-2.5 text-xs text-emerald-700 bg-emerald-50 p-3 rounded-2xl border border-emerald-100 leading-relaxed">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Period Selection */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-slate-550">الفترة الزمنية</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'today', label: 'اليوم' },
                { id: 'this_week', label: 'هذا الأسبوع' },
                { id: 'this_month', label: 'هذا الشهر' },
                { id: 'last_month', label: 'الشهر الماضي' },
                { id: 'last_30_days', label: 'آخر 30 يوماً' },
                { id: 'custom', label: 'مخصصة...' }
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPeriod(p.id as ReportPeriod)}
                  className={`py-2 px-1 rounded-xl text-[10px] font-bold border transition-all text-center ${
                    period === p.id
                      ? 'bg-slate-900 border-slate-900 text-white shadow-3xs'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Custom Range Picker */}
            {period === 'custom' && (
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-2xl animate-fade-in mt-2">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-400 flex items-center gap-1 justify-end">
                    <Calendar className="w-3 h-3 text-slate-400" />
                    <span>تاريخ البدء</span>
                  </label>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="w-full text-right p-2 bg-white border border-slate-200 rounded-xl text-xs outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-400 flex items-center gap-1 justify-end">
                    <Calendar className="w-3 h-3 text-slate-400" />
                    <span>تاريخ الانتهاء</span>
                  </label>
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="w-full text-right p-2 bg-white border border-slate-200 rounded-xl text-xs outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Filters Grid */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            {/* Currency */}
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-550">العملة</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as BusinessReportFilters['currency'])}
                className="w-full bg-slate-50 border border-slate-200 focus:border-slate-450 px-2.5 py-2.5 rounded-xl text-xs outline-none"
              >
                <option value="ALL">كل العملات</option>
                <option value="YER">YER — ريال يمني</option>
                <option value="SAR">SAR — ريال سعودي</option>
                <option value="USD">USD — دولار أمريكي</option>
              </select>
            </div>

            {/* Status */}
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-550">حالة التحقق</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as BusinessReportFilters['status'])}
                className="w-full bg-slate-50 border border-slate-200 focus:border-slate-450 px-2.5 py-2.5 rounded-xl text-xs outline-none"
              >
                <option value="all">كل الحالات</option>
                <option value="verified">موثق ومعتمد</option>
                <option value="ready">جاهز</option>
                <option value="stored">تم الرفع</option>
                <option value="received">تم الاستلام</option>
                <option value="matched">مطابق</option>
                <option value="failed">فشل التحليل</option>
              </select>
            </div>

            {/* Team Member */}
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-550">العضو المسؤول</label>
              <select
                value={teamMemberId}
                onChange={(e) => setTeamMemberId(e.target.value)}
                disabled={loadingTeam}
                className="w-full bg-slate-50 border border-slate-200 focus:border-slate-450 px-2.5 py-2.5 rounded-xl text-xs outline-none disabled:opacity-50"
              >
                <option value="ALL">كل أعضاء الفريق</option>
                {team.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.profile?.full_name || m.profile?.phone || 'موظف نشط'}
                  </option>
                ))}
              </select>
            </div>

            {/* Financial Entity */}
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-550">الجهة المالية</label>
              <select
                value={financialEntity}
                onChange={(e) => setFinancialEntity(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 focus:border-slate-450 px-2.5 py-2.5 rounded-xl text-xs outline-none"
              >
                <option value="ALL">كل الجهات المالية</option>
                {financialEntities.map((ent) => (
                  <option key={ent} value={ent}>
                    {ent}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Content Checkboxes */}
          <div className="space-y-2 p-3 bg-slate-50 border border-slate-200 rounded-2xl">
            <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">محتويات ملف التقرير</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeDetails}
                  onChange={(e) => setIncludeDetails(e.target.checked)}
                  className="rounded border-slate-300 accent-slate-900"
                />
                <span>تضمين تفاصيل العمليات</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeTeamPerformance}
                  onChange={(e) => setIncludeTeamPerformance(e.target.checked)}
                  className="rounded border-slate-300 accent-slate-900"
                />
                <span>تضمين أداء أعضاء الفريق</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeStatusDistribution}
                  onChange={(e) => setIncludeStatusDistribution(e.target.checked)}
                  className="rounded border-slate-300 accent-slate-900"
                />
                <span>تضمين التوزيع حسب الحالة</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeCurrencyDistribution}
                  onChange={(e) => setIncludeCurrencyDistribution(e.target.checked)}
                  className="rounded border-slate-300 accent-slate-900"
                />
                <span>تضمين التوزيع حسب العملة</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeEntityDistribution}
                  onChange={(e) => setIncludeEntityDistribution(e.target.checked)}
                  className="rounded border-slate-300 accent-slate-900"
                />
                <span>تضمين التوزيع حسب الجهة</span>
              </label>
            </div>
          </div>

          {/* Delivery Phone Number */}
          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-550 flex items-center gap-1 justify-end">
              <Phone className="w-3.5 h-3.5 text-slate-400" />
              <span>رقم واتساب المستلم للتقرير</span>
            </label>

            <div className="relative flex items-center rounded-2xl border border-slate-200 bg-slate-50 focus-within:bg-white focus-within:border-slate-400 transition-all overflow-hidden" dir="ltr">
              <span className="px-3.5 py-3 bg-slate-100 border-r border-slate-200 text-slate-500 font-mono font-bold text-xs select-none">
                +967
              </span>
              <input
                type="tel"
                value={whatsappPhone}
                onChange={(e) => {
                  const val = parseYemeniLocalPhone(e.target.value);
                  setWhatsappPhone(val.substring(0, 9));
                  setErrorMsg(null);
                }}
                placeholder="7XXXXXXXX"
                className="w-full text-left font-mono font-bold text-xs p-3 bg-transparent border-none outline-none"
                maxLength={9}
                required
              />
            </div>
            <p className="text-[9px] text-slate-400 leading-relaxed">
              اكتب الأرقام المحلية اليمنية التسعة فقط (مثل 777634971) دون رمز الدولة.
            </p>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full mt-4 bg-slate-900 hover:bg-black disabled:bg-slate-300 text-white font-bold py-3.5 px-4 rounded-2xl shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer text-xs"
          >
            {submitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                <span>جاري تسجيل وإرسال طلب التقرير...</span>
              </>
            ) : (
              <>
                <span>إرسال طلب التقرير</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
