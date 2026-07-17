import { useCallback, useState, useEffect, useMemo } from 'react';
import { PlusCircle, AlertCircle, RefreshCw, Filter, Trash2, Loader2, ArrowLeft } from 'lucide-react';
import type { BusinessOperationItem, BusinessProfile } from '../../../lib/businessApi';
import { getBusinessReportRequests, type BusinessReportHistoryItem } from '../../../lib/businessReportsApi';
import { formatYemeniDisplay, toLatinDigits } from '../../../lib/digits';
import { formatYemenDate, formatYemenTime } from '../../../utils/numerals';

// Sub-components
import BusinessReportRequestSheet from './BusinessReportRequestSheet';
import BusinessReportHistory from './BusinessReportHistory';
import BusinessOperationsSummary from './BusinessOperationsSummary';
import BusinessTeamPerformance from './BusinessTeamPerformance';
import BusinessProcessingQuality from './BusinessProcessingQuality';
import BusinessRecentOperations from './BusinessRecentOperations';
import BusinessCurrencyDistribution from './BusinessCurrencyDistribution';
import { getOperationDate, getOperationVerificationState } from './businessReportUtils';

type ReportBusiness = BusinessProfile & { team_role?: string | null };

interface BusinessReportsProps {
  business: ReportBusiness;
  operations: BusinessOperationItem[];
  loading: boolean;
  operationsError: string | null;
  onRefreshOperations: () => void;
  onNavigate: (page: string, token?: string) => void;
}

export default function BusinessReports({
  business,
  operations,
  loading,
  operationsError,
  onRefreshOperations,
  onNavigate
}: BusinessReportsProps) {
  // State for request modal
  const [showRequestSheet, setShowRequestSheet] = useState(false);
  
  // State for filter modal
  const [showFilterSheet, setShowFilterSheet] = useState(false);

  // Report requests list history
  const [requests, setRequests] = useState<BusinessReportHistoryItem[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requestsError, setRequestsError] = useState<string | null>(null);

  // Local analytics filters
  const [localPeriod, setLocalPeriod] = useState<string>('last_30_days');
  const [localCurrency, setLocalCurrency] = useState<string>('ALL');
  const [localStatus, setLocalStatus] = useState<string>('ALL');
  const [localCustomFrom, setLocalCustomFrom] = useState('');
  const [localCustomTo, setLocalCustomTo] = useState('');

  // Fetch report requests history
  const loadRequests = useCallback(async () => {
    if (!business?.id) return;
    setLoadingRequests(true);
    setRequestsError(null);
    try {
      const data = await getBusinessReportRequests(business.id);
      setRequests(data);
    } catch (err: unknown) {
      console.error(err);
      setRequestsError('تعذر تحميل التقارير. تحقق من الاتصال ثم أعد المحاولة.');
    } finally {
      setLoadingRequests(false);
    }
  }, [business.id]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  // Handle successful report creation
  const handleRequestSuccess = () => {
    setShowRequestSheet(false);
    loadRequests();
  };

  // Last report computed helper
  const lastReport = requests.length > 0 ? requests[0] : null;

  // Filter local operations based on active filters
  const filteredOperations = useMemo(() => {
    return operations.filter((item) => {
      const op = item.operation;
      if (!op) return false;

      // 1. Currency filter
      if (localCurrency !== 'ALL' && op.currency !== localCurrency) {
        return false;
      }

      // 2. Status filter
      const state = getOperationVerificationState(item);
      
      if (localStatus !== 'ALL') {
        if (localStatus !== state) return false;
      }

      // 3. Period filter
      if (localPeriod !== 'ALL') {
        const opDate = getOperationDate(item);
        if (!opDate) return false;
        const now = new Date();

        if (localPeriod === 'today') {
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          if (opDate < today) return false;
        } else if (localPeriod === 'this_week') {
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          if (opDate < weekAgo) return false;
        } else if (localPeriod === 'this_month') {
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          if (opDate < startOfMonth) return false;
        } else if (localPeriod === 'last_30_days') {
          const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          if (opDate < thirtyDaysAgo) return false;
        } else if (localPeriod === 'custom') {
          if (localCustomFrom) {
            const start = new Date(localCustomFrom);
            start.setHours(0, 0, 0, 0);
            if (opDate < start) return false;
          }
          if (localCustomTo) {
            const end = new Date(localCustomTo);
            end.setHours(23, 59, 59, 999);
            if (opDate > end) return false;
          }
        }
      }

      return true;
    });
  }, [operations, localPeriod, localCurrency, localStatus, localCustomFrom, localCustomTo]);

  // Translate filters labels for short filters bar
  const getFilterText = () => {
    let periodLabel = 'آخر 30 يوماً';
    switch (localPeriod) {
      case 'ALL': periodLabel = 'كل الفترات'; break;
      case 'today': periodLabel = 'اليوم'; break;
      case 'this_week': periodLabel = 'هذا الأسبوع'; break;
      case 'this_month': periodLabel = 'هذا الشهر'; break;
      case 'custom': periodLabel = 'فترة مخصصة'; break;
    }

    let currencyLabel = 'الكل';
    if (localCurrency !== 'ALL') currencyLabel = localCurrency;

    let statusLabel = 'الكل';
    switch (localStatus) {
      case 'verified': statusLabel = 'موثقة'; break;
      case 'pending': statusLabel = 'معلقة'; break;
      case 'needs_review': statusLabel = 'مراجعة'; break;
    }

    return `الفترة: ${periodLabel} | العملة: ${currencyLabel} | الحالة: ${statusLabel}`;
  };

  const hasActiveFilters = localPeriod !== 'last_30_days' || localCurrency !== 'ALL' || localStatus !== 'ALL';
  const canRequestReports =
    business.workspace_role === 'owner' ||
    business.workspace_role === 'manager' ||
    business.team_role === 'manager' ||
    (!business.workspace_role && !business.team_role);

  const clearFilters = () => {
    setLocalPeriod('last_30_days');
    setLocalCurrency('ALL');
    setLocalStatus('ALL');
    setLocalCustomFrom('');
    setLocalCustomTo('');
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'queued': return 'بانتظار المعالجة';
      case 'processing': return 'جارٍ الإعداد';
      case 'ready': return 'التقرير جاهز';
      case 'sent': return 'تم الإرسال';
      case 'failed': return 'تعذر الإعداد';
      case 'cancelled': return 'ملغى';
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'queued': return 'text-slate-500 bg-slate-100 border-slate-200';
      case 'processing': return 'text-amber-700 bg-amber-50 border-amber-100';
      case 'ready': return 'text-blue-700 bg-blue-50 border-blue-100';
      case 'sent': return 'text-emerald-700 bg-emerald-50 border-emerald-100';
      case 'failed': return 'text-rose-700 bg-rose-50 border-rose-100';
      default: return 'text-slate-500 bg-slate-100 border-slate-200';
    }
  };

  return (
    <div className="space-y-5 text-right font-arabic" dir="rtl">
      
      {/* Title */}
      <div>
        <h2 className="text-sm font-bold text-slate-900">التقارير</h2>
        <p className="text-[10px] text-slate-500 mt-0.5">
          تابع عمليات النشاط واطلب تقارير مفصلة تُرسل إلى واتساب.
        </p>
      </div>

      {/* Button: Request Report Card */}
      <div className="bg-white border border-slate-250/60 rounded-3xl p-4.5 shadow-3xs flex items-center justify-between gap-4">
        <div className="text-right">
          <h4 className="text-xs font-bold text-slate-800">طلب تقرير جديد</h4>
          <p className="text-[9px] text-slate-450 mt-1">حدد الفترة والفلاتر، وسيتم إعداد التقرير وإرساله إلى واتساب.</p>
        </div>
        <button
          onClick={() => setShowRequestSheet(true)}
          disabled={!canRequestReports}
          className="bg-slate-900 hover:bg-black text-white text-xs font-bold py-2.5 px-4.5 rounded-2xl transition-all shadow-xs flex items-center gap-1 shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span>إعداد التقرير</span>
        </button>
      </div>
      {!canRequestReports && (
        <p className="text-[10px] text-slate-500">طلب التقارير متاح لمالك النشاط أو المدير المصرح فقط.</p>
      )}

      {/* Last Report Status Card */}
      <div className="bg-slate-50 border border-slate-200 rounded-3xl p-4.5 shadow-3xs space-y-2">
        <span className="block text-[9px] font-bold text-slate-450 uppercase tracking-wider">آخر تقرير</span>
        
        {lastReport ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full border ${getStatusColor(lastReport.status)}`}>
                {getStatusText(lastReport.status)}
              </span>
              <span className="text-[11px] font-bold text-slate-800">
                {toLatinDigits(lastReport.report_title || 'تقرير عمليات النشاط')}
              </span>
            </div>
            
            <div className="flex justify-between text-[9px] text-slate-400">
              <span className="font-mono" dir="ltr">
                {formatYemeniDisplay(lastReport.destination_phone)}
              </span>
              <span className="font-mono" dir="ltr">{formatYemenDate(lastReport.date_from)} — {formatYemenDate(lastReport.date_to)}</span>
            </div>
            <div className="text-[9px] text-slate-400">
              طُلب: {formatYemenDate(lastReport.requested_at)} — {formatYemenTime(lastReport.requested_at)}
              {lastReport.sent_at ? ` | أُرسل: ${formatYemenDate(lastReport.sent_at)} — ${formatYemenTime(lastReport.sent_at)}` : ''}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between py-1">
            <span className="text-[10px] text-slate-500">لم يتم طلب أي تقرير بعد.</span>
            <button
              onClick={() => setShowRequestSheet(true)}
              disabled={!canRequestReports}
              className="text-[9px] font-bold text-slate-700 bg-white border border-slate-200 px-3 py-1 rounded-xl hover:bg-slate-100 transition-all cursor-pointer"
            >
              طلب أول تقرير
            </button>
          </div>
        )}
      </div>

      {/* Short Filters Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 flex items-center justify-between gap-3 text-[10px] shadow-3xs">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowFilterSheet(true)}
            className="flex items-center gap-1 text-[9px] font-bold bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-xl hover:bg-slate-100 text-slate-700 transition-all cursor-pointer"
          >
            <Filter className="w-3 h-3 text-slate-500" />
            <span>تعديل الفلاتر</span>
          </button>
          
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-0.5 text-[9px] font-bold text-rose-600 hover:bg-rose-50 px-2 py-1.5 rounded-xl transition-all cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              <span>مسح</span>
            </button>
          )}
        </div>
        
        <span className="text-slate-600 font-bold truncate max-w-[200px]">
          {getFilterText()}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-8 text-[10px] text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> جارٍ تحميل عمليات النشاط...
        </div>
      ) : operationsError ? (
        <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-[10px] text-rose-700">
          <div className="flex items-center gap-2"><AlertCircle className="h-4 w-4" />{operationsError}</div>
          <button onClick={onRefreshOperations} className="mt-3 inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-white px-3 py-1.5 font-bold">
            <RefreshCw className="h-3 w-3" /> إعادة المحاولة
          </button>
        </div>
      ) : (
        <>
          <BusinessOperationsSummary operations={filteredOperations} />
          <BusinessCurrencyDistribution operations={filteredOperations} />

          <BusinessTeamPerformance operations={filteredOperations} />

          <BusinessProcessingQuality operations={filteredOperations} />

          <BusinessRecentOperations operations={filteredOperations} onNavigate={onNavigate} />
        </>
      )}

      {/* History log */}
      <BusinessReportHistory
        requests={requests}
        loading={loadingRequests}
        error={requestsError}
        onRefresh={loadRequests}
      />

      {/* Modals/Sheets */}
      {/* 1. Request Report Sheet */}
      {showRequestSheet && canRequestReports && (
        <BusinessReportRequestSheet
          business={business}
          operations={operations}
          onClose={() => setShowRequestSheet(false)}
          onSuccess={handleRequestSuccess}
        />
      )}

      {/* 2. Analytical Filters Sheet */}
      {showFilterSheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs font-arabic animate-fade-in" dir="rtl">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-slate-200/80 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-slide-up">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <span className="text-xs font-bold text-slate-800">تصفية تحليلات الصفحة</span>
              <button
                onClick={() => setShowFilterSheet(false)}
                className="p-1 hover:bg-slate-50 border border-slate-200 rounded-lg transition-all"
              >
                <ArrowLeft className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            
            <div className="p-4.5 overflow-y-auto space-y-4 text-right">
              {/* Period */}
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-500">الفترة الزمنية</label>
                <select
                  value={localPeriod}
                  onChange={(e) => setLocalPeriod(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl text-xs outline-none"
                >
                  <option value="ALL">كل الفترات</option>
                  <option value="today">اليوم</option>
                  <option value="this_week">آخر 7 أيام</option>
                  <option value="this_month">هذا الشهر</option>
                  <option value="last_30_days">آخر 30 يوماً</option>
                  <option value="custom">فترة مخصصة...</option>
                </select>
              </div>

              {localPeriod === 'custom' && (
                <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="space-y-1">
                    <label className="text-[9px] text-slate-400 block">من تاريخ</label>
                    <input
                      type="date"
                      value={localCustomFrom}
                      onChange={(e) => setLocalCustomFrom(e.target.value)}
                      className="w-full text-right p-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] text-slate-400 block">إلى تاريخ</label>
                    <input
                      type="date"
                      value={localCustomTo}
                      onChange={(e) => setLocalCustomTo(e.target.value)}
                      className="w-full text-right p-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Currency */}
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-500">العملة</label>
                <select
                  value={localCurrency}
                  onChange={(e) => setLocalCurrency(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl text-xs outline-none"
                >
                  <option value="ALL">كل العملات</option>
                  <option value="YER">الريال اليمني (YER)</option>
                  <option value="SAR">الريال السعودي (SAR)</option>
                  <option value="USD">الدولار الأمريكي (USD)</option>
                </select>
              </div>

              {/* Status */}
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-slate-500">الحالة</label>
                <select
                  value={localStatus}
                  onChange={(e) => setLocalStatus(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 px-3 py-2.5 rounded-xl text-xs outline-none"
                >
                  <option value="ALL">كل العمليات</option>
                  <option value="verified">موثقة ومعتمدة</option>
                  <option value="pending">معلقة</option>
                  <option value="needs_review">تحتاج مراجعة</option>
                </select>
              </div>

              <button
                type="button"
                onClick={() => setShowFilterSheet(false)}
                className="w-full bg-slate-900 hover:bg-black text-white font-bold py-3 rounded-xl transition-all cursor-pointer text-xs"
              >
                تطبيق فلاتر التصفية
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
