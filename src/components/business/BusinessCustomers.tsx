import { useEffect, useState } from 'react';
import { ArrowRight, Loader2, Users, User } from 'lucide-react';
import { getBusinessCustomers, getBusinessMediaSignedUrl, getUserBusinessContexts } from '../../lib/businessApi';

interface BusinessCustomersProps {
  onNavigate: (page: string, token?: string) => void;
  businessId?: string;
}

export default function BusinessCustomers({ onNavigate, businessId }: BusinessCustomersProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [bizId, setBizId] = useState<string | null>(businessId || null);

  const loadCustomers = async (id?: string) => {
    setLoading(true);
    setError(null);
    try {
      let target = id || bizId;
      if (!target) {
        const contexts = await getUserBusinessContexts();
        const current = contexts.owned_businesses?.[0] || contexts.team_businesses?.[0] || null;
        target = current?.id;
        setBizId(target || null);
      }
      if (!target) {
        setCustomers([]);
        setError('No business found to load customers for.');
        return;
      }
      const list = await getBusinessCustomers(target);
      setCustomers(list || []);
    } catch (e: any) {
      setError(e.message || 'فشل في تحميل قائمة العملاء.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers(businessId);
  }, [businessId]);

  return (
    <div className="space-y-4 font-arabic" dir="rtl">
      <div className="flex items-center gap-2">
        <button onClick={() => onNavigate('business-manage')} className="p-2 bg-white rounded-lg border border-slate-200 hover:bg-slate-50 transition-all">
          <ArrowRight className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-slate-950 leading-tight">قائمة العملاء</h1>
          <p className="text-[11px] text-slate-500">عرض وإدارة العملاء المرتبطين بهذا النشاط</p>
        </div>
      </div>

      <section className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-slate-700" />
          </div>
        ) : error ? (
          <div className="text-center py-6 text-sm text-rose-600">{error}</div>
        ) : customers.length === 0 ? (
          <div className="text-center py-6 text-sm text-slate-500">لا يوجد عملاء مسجلين بعد.</div>
        ) : (
          <ul className="space-y-2">
            {customers.map((c: any) => (
              <li key={c.id || c.user_id} className="flex items-center gap-3 p-3 border border-slate-100 rounded-lg">
                <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center text-slate-700">
                  <User className="w-5 h-5" />
                </div>
                <div className="flex-1 text-right">
                  <div className="text-sm font-bold text-slate-900">{c.full_name || c.name || c.display_name || 'مستخدم سند'}</div>
                  {c.phone && <div className="text-[11px] text-slate-500 mt-0.5">{c.phone}</div>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
