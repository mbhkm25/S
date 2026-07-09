import { useState, useEffect } from 'react';
import { getBusinessOperations, getUserBusinessContexts, BusinessOperationItem } from '../../lib/businessApi';
import { ArrowRight, FileText, Calendar, DollarSign, ArrowLeft, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { formatArabicDate, toLatinDigits } from '../../lib/digits';

interface BusinessOperationsProps {
  onNavigate: (page: string, token?: string) => void;
}

export default function BusinessOperations({ onNavigate }: BusinessOperationsProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [operations, setOperations] = useState<BusinessOperationItem[]>([]);
  const [businessName, setBusinessName] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const contexts = await getUserBusinessContexts();
      const currentBusiness = contexts.owned_businesses?.[0] || contexts.team_businesses?.[0];
      
      if (!currentBusiness) {
        throw new Error('لم يتم العثور على نشاط تجاري نشط.');
      }

      setBusinessName(currentBusiness.name);
      const ops = await getBusinessOperations(currentBusiness.id);
      setOperations(Array.isArray(ops) ? ops : []);
    } catch (err: any) {
      console.error('[BusinessOperations] Error loading business operations:', err);
      setError(err.message || 'فشل في تحميل العمليات المالية.');
      setOperations([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ready':
        return <span className="bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full font-arabic">مكتمل</span>;
      case 'failed':
        return <span className="bg-rose-50 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded-full font-arabic">فشل التحليل</span>;
      case 'stored':
        return <span className="bg-blue-50 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full font-arabic">تم الرفع</span>;
      default:
        return <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-full font-arabic">{status}</span>;
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-3 font-arabic">
        <Loader2 className="w-6 h-6 text-slate-800 animate-spin" />
        <span className="text-xs text-slate-500">جاري تحميل قائمة العمليات...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200/60 p-5 space-y-4 shadow-sm font-arabic text-center">
        <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
        <div className="space-y-1">
          <h2 className="text-sm font-bold text-slate-900">حدث خطأ أثناء تحميل العمليات</h2>
          <p className="text-xs text-slate-500">{error}</p>
        </div>
        <button
          onClick={loadData}
          className="inline-flex items-center gap-1.5 text-xs text-slate-700 hover:text-black font-bold border border-slate-200 hover:bg-slate-50 px-4 py-2 rounded-xl transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>إعادة المحاولة</span>
        </button>
      </div>
    );
  }

  const items = Array.isArray(operations) ? operations : [];

  return (
    <div className="space-y-5 font-arabic" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button 
          onClick={() => onNavigate('business-manage')} 
          className="p-2 bg-white rounded-xl border border-slate-200/60 hover:bg-slate-50 transition-all"
        >
          <ArrowRight className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-sm font-bold text-slate-900">عمليات {businessName}</h1>
          <p className="text-[10px] text-slate-500">متابعة الإشعارات المالية والتأكيد المستلم</p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200/60 p-8 text-center space-y-4 shadow-sm">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-50 border border-slate-100 text-slate-400">
            <FileText className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xs font-bold text-slate-900">لا توجد عمليات مسجلة بعد</h2>
            <p className="text-[10px] text-slate-400 leading-relaxed px-4">
              عند رفع إشعارات دفع وتعيين هذا النشاط كطرف، ستظهر جميع المعاملات وتفاصيلها هنا.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const op = item.operation;
            if (!op) return null;

            const summary = op.summary || 'إشعار مالي';
            const entity = op.financial_entity || '';
            const type = op.transaction_type || '';
            const amount = op.amount;
            const currency = op.currency || 'ر.ي';
            const ref = op.reference_number;
            const date = op.transaction_datetime || op.created_at;
            
            const linkedBy = item.linked_by?.full_name || item.linked_by?.phone || '';
            const verifiedBy = item.verified_by?.full_name || item.verified_by?.phone || '';

            return (
              <div 
                key={item.link_id || op.id}
                onClick={() => onNavigate('details', op.public_token)}
                className="bg-white hover:border-slate-300 border border-slate-200/60 p-4 rounded-3xl transition-all shadow-xs flex flex-col gap-3 cursor-pointer text-right"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-slate-900 font-arabic">
                        {summary}
                      </span>
                      {getStatusLabel(op.status)}
                      {op.ai_status === 'completed' && (
                        <span className="bg-indigo-50 text-indigo-700 text-[8px] font-bold px-1.5 py-0.5 rounded font-arabic">تحليل ذكي</span>
                      )}
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400 font-arabic">
                      {entity && (
                        <span>{entity} {type ? `(${type})` : ''}</span>
                      )}
                      {ref && (
                        <span className="font-mono">مرجع: {toLatinDigits(ref)}</span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-300" />
                        <span>{formatArabicDate(date)}</span>
                      </span>
                    </div>
                  </div>

                  <div className="text-left shrink-0">
                    <div className="text-xs font-bold text-emerald-600 flex items-center gap-0.5 justify-end">
                      <span>{toLatinDigits(amount?.toLocaleString() || '0')}</span>
                      <span className="text-[8px] font-normal text-emerald-500">{currency}</span>
                    </div>
                  </div>
                </div>

                {/* Linking / Verification info */}
                {(linkedBy || verifiedBy) && (
                  <div className="bg-slate-50 p-2.5 rounded-2xl text-[9px] text-slate-500 space-y-1 font-arabic border border-slate-100">
                    {linkedBy && (
                      <div className="flex justify-between items-center">
                        <span>تم الربط بواسطة:</span>
                        <span className="font-bold text-slate-700">{linkedBy}</span>
                      </div>
                    )}
                    {verifiedBy && (
                      <div className="flex justify-between items-center">
                        <span>تم التحقق بواسطة:</span>
                        <span className="font-bold text-slate-700">{verifiedBy}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
