import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';
import { Loader2, AlertCircle, CheckCircle2, Calendar, Phone, Send, Clock, RefreshCw, Link2, FileText, Files } from 'lucide-react';
import { toLatinDigits, parseYemeniLocalPhone, formatYemeniDisplay } from '../lib/digits';
import { callSanadAppFunction } from '../lib/sanadFunctions';

type DeliveryFormat = 'interactive' | 'pdf' | 'both';

interface ReportsProps {
  profile: Profile;
  standalone?: boolean;
  ensureProfileComplete?: (action: () => void) => void;
}

interface ReportRequestItem {
  id: string;
  report_scope: string;
  date_from: string | null;
  date_to: string | null;
  delivery_channel: string;
  delivery_format?: DeliveryFormat | null;
  destination_phone: string;
  status: 'queued' | 'processing' | 'sent' | 'failed';
  created_at: string;
  error_message?: string | null;
}

const deliveryOptions: Array<{
  value: DeliveryFormat;
  title: string;
  description: string;
  recommended?: boolean;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    value: 'interactive',
    title: 'رابط تفاعلي',
    description: 'الأفضل للجوال والبحث والتصفية وفتح تفاصيل العمليات.',
    recommended: true,
    icon: Link2,
  },
  {
    value: 'pdf',
    title: 'ملف PDF',
    description: 'نسخة ثابتة مناسبة للحفظ والطباعة والمشاركة.',
    icon: FileText,
  },
  {
    value: 'both',
    title: 'الرابط + PDF',
    description: 'استلم النسخة التفاعلية والملف الثابت معًا.',
    icon: Files,
  },
];

export default function Reports({ profile, standalone, ensureProfileComplete }: ReportsProps) {
  const [reportScope, setReportScope] = useState<'all' | 'sent' | 'verified'>('all');
  const [period, setPeriod] = useState<'today' | '7_days' | '30_days' | 'custom'>('7_days');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [deliveryFormat, setDeliveryFormat] = useState<DeliveryFormat>('interactive');

  const [phoneMode, setPhoneMode] = useState<'registered' | 'other'>(profile.phone ? 'registered' : 'other');
  const [localPhone, setLocalPhone] = useState(profile.phone ? parseYemeniLocalPhone(profile.phone) : '');

  const [requesting, setRequesting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [requestsList, setRequestsList] = useState<ReportRequestItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    if (profile.phone) {
      setLocalPhone(parseYemeniLocalPhone(profile.phone));
      if (!phoneMode) setPhoneMode('registered');
    }
  }, [profile.phone]);

  const loadRequestsHistory = async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const { data, error } = await supabase
        .from('report_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequestsList((data || []) as ReportRequestItem[]);
    } catch (err: any) {
      console.error('Error fetching report requests:', err);
      let errMsg = 'تعذر جلب سجل طلبات التقارير.';
      if (err.message && (err.message.includes('Failed to fetch') || err.name === 'TypeError')) {
        errMsg = 'فشل جلب البيانات بسبب انقطاع الاتصال. يرجى التحقق من جودة الإنترنت وصحة تهيئة Supabase.';
      }
      setListError(errMsg);
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    void loadRequestsHistory();
  }, []);

  const calculateDates = (): { dateFrom: string | null; dateTo: string | null } => {
    const now = new Date();
    switch (period) {
      case 'today': {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        return { dateFrom: start.toISOString(), dateTo: end.toISOString() };
      }
      case '7_days':
        return { dateFrom: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(), dateTo: now.toISOString() };
      case '30_days':
        return { dateFrom: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(), dateTo: now.toISOString() };
      case 'custom': {
        if (!customDateFrom) return { dateFrom: null, dateTo: null };
        return {
          dateFrom: new Date(customDateFrom).toISOString(),
          dateTo: customDateTo ? new Date(customDateTo).toISOString() : now.toISOString(),
        };
      }
      default:
        return { dateFrom: null, dateTo: null };
    }
  };

  const successTextForFormat = (format: DeliveryFormat) => {
    if (format === 'pdf') return 'تم استلام الطلب. سيصلك ملف PDF عبر واتساب خلال لحظات.';
    if (format === 'both') return 'تم استلام الطلب. سيصلك رابط التقرير وملف PDF عبر واتساب خلال لحظات.';
    return 'تم استلام الطلب. سيصلك رابط التقرير التفاعلي عبر واتساب خلال لحظات.';
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();

    const performSubmit = async () => {
      setFormError(null);
      setSuccessMessage(null);
      setRequesting(true);

      try {
        let destinationPhone = '';
        if (phoneMode === 'registered') {
          if (!profile.phone) throw new Error('لم يتم العثور على رقم هاتف مسجل في ملفك الشخصي.');
          const localPart = parseYemeniLocalPhone(toLatinDigits(profile.phone.trim()));
          if (!localPart || localPart.length !== 9) {
            throw new Error('رقم الهاتف المسجل غير صالح لتلقي تقارير واتساب. يرجى استخدام رقم هاتف يمني من 9 أرقام.');
          }
          destinationPhone = `967${localPart}`;
        } else {
          const cleanedLocal = toLatinDigits(localPhone.trim());
          if (!cleanedLocal) throw new Error('يرجى إدخال رقم هاتف لاستلام التقرير.');
          if (cleanedLocal.length !== 9) {
            throw new Error('يجب أن يتكون الرقم المحلي اليمني من 9 أرقام بالضبط (مثال: 777634971).');
          }
          if (!['70', '71', '73', '77', '78', '01', '02', '03', '04', '05', '06', '07'].some(prefix => cleanedLocal.startsWith(prefix))) {
            throw new Error('الرقم المدخل لا يتوافق مع مفاتيح الاتصالات اليمنية المعتمدة.');
          }
          destinationPhone = `967${cleanedLocal}`;
        }

        const { dateFrom, dateTo } = calculateDates();
        if (period === 'custom' && !dateFrom) throw new Error('يرجى تحديد تاريخ بداية الفترة للطلب المخصص.');

        const { data, error } = await supabase.rpc('create_report_request', {
          p_report_scope: reportScope,
          p_date_from: dateFrom,
          p_date_to: dateTo,
          p_filters: {},
          p_destination_phone: destinationPhone,
          p_delivery_format: deliveryFormat,
        });

        if (error) throw new Error(error.message || 'فشل استدعاء خدمة طلب التقارير.');

        const reportRequestId = data?.[0]?.report_request_id || (data as any)?.report_request_id;
        if (!reportRequestId) throw new Error('missing_report_request_id');

        let reportTriggerSuccess = true;
        try {
          await callSanadAppFunction('sanad-v3-app-trigger-report', { report_request_id: reportRequestId });
        } catch (webhookError) {
          reportTriggerSuccess = false;
          console.warn('SANAD report processing trigger failed:', webhookError);
        }

        setSuccessMessage(
          reportTriggerSuccess
            ? successTextForFormat(deliveryFormat)
            : 'تم حفظ طلب التقرير، وقد تتأخر المعالجة قليلاً.',
        );
        void loadRequestsHistory();
      } catch (err: any) {
        console.error('Error creating report request:', err);
        setFormError(err.message || 'فشل تسجيل طلب التقرير.');
      } finally {
        setRequesting(false);
      }
    };

    if (ensureProfileComplete) ensureProfileComplete(performSubmit);
    else void performSubmit();
  };

  const translateScope = (scope: string) => {
    switch (scope) {
      case 'all': return 'كل العمليات الموثقة';
      case 'sent': return 'عمليات أرسلتها أنت';
      case 'verified': return 'عمليات قمت بالتحقق منها';
      default: return scope;
    }
  };

  const translateDeliveryFormat = (format?: string | null) => {
    switch (format) {
      case 'pdf': return 'PDF';
      case 'both': return 'رابط + PDF';
      case 'interactive':
      default: return 'رابط تفاعلي';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'queued': return 'بانتظار المعالجة';
      case 'processing': return 'جارٍ إنشاء التقرير';
      case 'sent': return 'تم إرسال التقرير';
      case 'failed': return 'فشل إنشاء أو إرسال التقرير';
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'queued': return 'bg-slate-50 text-slate-500 border-slate-200';
      case 'processing': return 'bg-amber-50 text-amber-700 border-amber-100';
      case 'sent': return 'bg-emerald-50 text-emerald-700 border-emerald-150';
      case 'failed': return 'bg-rose-50 text-rose-700 border-rose-100';
      default: return 'bg-slate-50 text-slate-500 border-slate-200';
    }
  };

  return (
    <div className="space-y-5" id="reports_view">
      {standalone && (
        <div className="text-right">
          <h2 className="text-base font-bold text-slate-950 font-arabic">طلب كشف حساب مالي</h2>
          <p className="text-[11px] text-slate-500 font-arabic mt-1 leading-relaxed">
            أنشئ تقريرًا لعملياتك واختر استلامه كرابط تفاعلي أو PDF عبر واتساب.
          </p>
        </div>
      )}

      <div className="bg-white border border-slate-200/60 rounded-3xl p-4.5 shadow-sm space-y-4">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider text-right font-arabic">طلب كشف حساب مالي</h3>

        <form onSubmit={handleSubmitRequest} className="space-y-4">
          {formError && (
            <div className="flex items-start gap-2 text-xs text-rose-600 bg-rose-50 p-3 rounded-2xl border border-rose-100 text-right leading-relaxed">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {successMessage && (
            <div className="flex items-start gap-2 text-xs text-emerald-700 bg-emerald-50 p-3 rounded-2xl border border-emerald-100 text-right leading-relaxed">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          <div className="space-y-1.5 text-right">
            <label className="block text-[11px] font-bold text-slate-500 font-arabic">نطاق ومحتوى التقرير</label>
            <div className="grid grid-cols-1 gap-2">
              {([
                ['all', 'كل العمليات الموثقة بسند'],
                ['sent', 'عمليات رفعتها بنفسي'],
                ['verified', 'عمليات قمت بالتحقق منها'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setReportScope(value)}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all text-right font-arabic ${
                    reportScope === value
                      ? 'bg-[#111111] border-[#111111] text-white'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5 text-right">
            <label className="block text-[11px] font-bold text-slate-500 font-arabic">الفترة الزمنية</label>
            <div className="grid grid-cols-2 gap-2">
              {([
                ['today', 'اليوم'],
                ['7_days', 'آخر 7 أيام'],
                ['30_days', 'آخر 30 يوماً'],
                ['custom', 'فترة مخصصة'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPeriod(value)}
                  className={`py-2.5 px-2 rounded-xl text-xs font-bold border transition-all font-arabic ${
                    period === value
                      ? 'bg-[#111111] border-[#111111] text-white'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {period === 'custom' && (
            <div className="grid grid-cols-1 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-2xl animate-fade-in">
              <div className="space-y-1 text-right">
                <label className="block text-[10px] font-bold text-slate-400 flex items-center gap-1 justify-end font-arabic">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  <span>تاريخ البدء (من)</span>
                </label>
                <input type="date" value={customDateFrom} onChange={e => setCustomDateFrom(e.target.value)} className="w-full text-right p-2 bg-white border border-slate-200 rounded-xl text-xs outline-none" />
              </div>
              <div className="space-y-1 text-right">
                <label className="block text-[10px] font-bold text-slate-400 flex items-center gap-1 justify-end font-arabic">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  <span>تاريخ الانتهاء (إلى)</span>
                </label>
                <input type="date" value={customDateTo} onChange={e => setCustomDateTo(e.target.value)} className="w-full text-right p-2 bg-white border border-slate-200 rounded-xl text-xs outline-none" />
              </div>
            </div>
          )}

          <div className="space-y-2 text-right">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 font-arabic">صيغة التقرير</label>
              <p className="text-[9px] text-slate-400 mt-0.5 font-arabic">جميع الصيغ تُنشأ من نفس البيانات المحفوظة لحظة الطلب.</p>
            </div>
            <div className="grid grid-cols-1 gap-2" id="report_delivery_format_options">
              {deliveryOptions.map(option => {
                const Icon = option.icon;
                const selected = deliveryFormat === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setDeliveryFormat(option.value);
                      setFormError(null);
                    }}
                    className={`relative w-full rounded-2xl border p-3 text-right transition-all ${
                      selected
                        ? 'border-[#111111] bg-slate-50 ring-1 ring-[#111111]'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${selected ? 'bg-[#111111] text-white' : 'bg-slate-100 text-slate-500'}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1 font-arabic">
                        <span className="flex items-center justify-end gap-2">
                          {option.recommended && (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[8px] font-bold text-emerald-700">موصى به</span>
                          )}
                          <span className="text-xs font-bold text-slate-900">{option.title}</span>
                        </span>
                        <span className="mt-1 block text-[9px] leading-relaxed text-slate-500">{option.description}</span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5 text-right">
            <label className="block text-[11px] font-bold text-slate-500 font-arabic">قناة التسليم المعتمدة</label>
            <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-2xl flex items-center justify-between">
              <span className="text-[10px] bg-[#111111] text-white font-bold px-2 py-0.5 rounded-full font-mono">WhatsApp</span>
              <span className="text-xs font-bold text-slate-800 font-arabic">{translateDeliveryFormat(deliveryFormat)}</span>
            </div>
          </div>

          <div className="space-y-1.5 text-right">
            <label className="block text-[11px] font-bold text-slate-500 font-arabic">تفضيلات رقم استلام التقرير</label>
            <div className="grid grid-cols-2 gap-2" id="delivery_preference_options">
              <button
                type="button"
                onClick={() => { setPhoneMode('registered'); setFormError(null); }}
                disabled={!profile.phone}
                className={`p-2.5 rounded-2xl border text-right transition-all flex flex-col justify-between gap-1 cursor-pointer select-none disabled:opacity-40 ${
                  phoneMode === 'registered'
                    ? 'border-[#111111] bg-slate-50 ring-1 ring-[#111111] text-slate-900'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-500'
                }`}
              >
                <span className="text-[10px] font-bold font-arabic">الرقم المسجل</span>
                <span className="text-[9px] font-mono text-slate-600 block truncate" dir="ltr">{profile.phone ? formatYemeniDisplay(profile.phone) : 'لا يوجد'}</span>
              </button>
              <button
                type="button"
                onClick={() => { setPhoneMode('other'); setFormError(null); }}
                className={`p-2.5 rounded-2xl border text-right transition-all flex flex-col justify-between gap-1 cursor-pointer select-none ${
                  phoneMode === 'other'
                    ? 'border-[#111111] bg-slate-50 ring-1 ring-[#111111] text-slate-900'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-500'
                }`}
              >
                <span className="text-[10px] font-bold font-arabic">إرسال لآخر</span>
                <span className="text-[9px] text-slate-400 font-arabic block">أدخل هاتف جديد</span>
              </button>
            </div>
          </div>

          {phoneMode === 'other' && (
            <div className="space-y-1 text-right animate-fade-in" id="custom_phone_input_block">
              <label className="block text-[11px] font-bold text-slate-500 flex items-center gap-1 justify-end font-arabic">
                <Phone className="w-3 h-3 text-slate-400" />
                <span>رقم واتساب المستلم للتقرير</span>
              </label>
              <div className="relative flex items-center rounded-2xl border border-slate-200 bg-slate-50 focus-within:bg-white focus-within:border-slate-400 transition-all overflow-hidden" dir="ltr">
                <span className="px-3.5 py-3 bg-slate-100 border-r border-slate-200 text-slate-500 font-mono font-bold text-xs select-none">+967</span>
                <input
                  type="tel"
                  value={localPhone}
                  onChange={e => {
                    const cleanedDigits = toLatinDigits(e.target.value).replace(/\D/g, '');
                    let localPart = '';
                    if (cleanedDigits.startsWith('00967')) localPart = cleanedDigits.substring(5, 14);
                    else if (cleanedDigits.startsWith('967')) localPart = cleanedDigits.substring(3, 12);
                    else if (cleanedDigits.startsWith('0')) localPart = cleanedDigits.substring(1, 10);
                    else localPart = cleanedDigits;
                    setLocalPhone(localPart.substring(0, 9).replace(/\D/g, ''));
                    setFormError(null);
                  }}
                  placeholder="7XXXXXXXX"
                  className="w-full text-left font-mono font-bold text-xs p-3 bg-transparent border-none outline-none"
                  maxLength={15}
                />
              </div>
              <p className="text-[9px] text-slate-400 leading-relaxed font-arabic text-right">اكتب الأرقام المحلية اليمنية التسعة فقط (مثل 777634971) دون رمز الدولة.</p>
            </div>
          )}

          <button type="submit" disabled={requesting} className="w-full bg-[#111111] hover:bg-black disabled:bg-slate-300 text-white font-bold py-3 px-4 rounded-2xl shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer text-xs font-arabic">
            {requesting ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin text-white" /><span>جاري تقديم الطلب...</span></>
            ) : (
              <><Send className="w-3.5 h-3.5" /><span>إرسال {translateDeliveryFormat(deliveryFormat)} عبر واتساب</span></>
            )}
          </button>
        </form>
      </div>

      <div className="bg-white border border-slate-200/60 rounded-3xl p-4.5 shadow-sm space-y-3.5">
        <div className="flex items-center justify-between">
          <button onClick={loadRequestsHistory} disabled={loadingList} title="تحديث القائمة" className="p-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-all active:scale-95 disabled:opacity-50">
            <RefreshCw className={`w-3 h-3 text-slate-500 ${loadingList ? 'animate-spin' : ''}`} />
          </button>
          <h3 className="text-xs font-bold text-slate-400 block uppercase tracking-wider font-arabic">سجل طلبات التقارير السابقة</h3>
        </div>

        {listError && <div className="p-3 bg-rose-50 border border-rose-150 text-rose-800 rounded-2xl text-xs font-arabic text-right">{listError}</div>}

        {loadingList ? (
          <div className="flex flex-col items-center justify-center py-8 space-y-2">
            <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
            <span className="text-[10px] text-slate-400 font-arabic">جاري جلب القائمة...</span>
          </div>
        ) : requestsList.length === 0 ? (
          <div className="bg-slate-50 border border-slate-150 rounded-2xl p-6 text-center" id="empty_reports_state">
            <Clock className="w-6 h-6 text-slate-300 mx-auto mb-1.5" />
            <p className="text-[10px] text-slate-400 leading-relaxed font-arabic">لا توجد طلبات تقارير سابقة بعد.</p>
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-0.5" id="reports_history_list">
            {requestsList.map(req => (
              <div key={req.id} className="bg-slate-50 border border-slate-200/60 rounded-2xl p-3 text-right space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full border border-slate-200 bg-white text-slate-600 font-arabic">{translateDeliveryFormat(req.delivery_format)}</span>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${getStatusColor(req.status)} font-arabic`}>{getStatusText(req.status)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] font-bold text-slate-800 font-arabic">{translateScope(req.report_scope)}</span>
                    <span className="block text-[8px] text-slate-400 font-mono mt-0.5" dir="ltr">{toLatinDigits(new Date(req.created_at).toLocaleString('ar-EG-u-nu-latn', { hour12: true, numberingSystem: 'latn' }))}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[10px] pt-1.5 border-t border-slate-200/40">
                  <div className="text-left font-mono text-slate-500" dir="ltr">{formatYemeniDisplay(req.destination_phone)}</div>
                  <div className="text-right text-slate-400 font-arabic">رقم الواتساب المستلم:</div>
                </div>

                {(req.date_from || req.date_to) && (
                  <div className="grid grid-cols-2 gap-2 text-[9px] text-slate-400 font-mono">
                    <div className="text-left" dir="ltr">إلى: {req.date_to ? toLatinDigits(new Date(req.date_to).toLocaleDateString('ar-EG-u-nu-latn', { numberingSystem: 'latn' })) : 'الآن'}</div>
                    <div className="text-right" dir="ltr">من: {req.date_from ? toLatinDigits(new Date(req.date_from).toLocaleDateString('ar-EG-u-nu-latn', { numberingSystem: 'latn' })) : 'البداية'}</div>
                  </div>
                )}

                {req.status === 'failed' && req.error_message && (
                  <p className="text-[9px] text-rose-600 bg-rose-50 border border-rose-100 rounded-lg p-1.5 leading-relaxed font-arabic">سبب الفشل: {req.error_message}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
