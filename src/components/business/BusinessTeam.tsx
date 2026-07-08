import React, { useState, useEffect } from 'react';
import { 
  getUserBusinessContexts, createBusinessTeamInvitation, 
  BusinessTeamMember, BusinessInvitation 
} from '../../lib/businessApi';
import { 
  ArrowRight, Users, Plus, Loader2, AlertTriangle, 
  CheckCircle2, Clock, Phone, UserPlus, RefreshCw 
} from 'lucide-react';
import { toLatinDigits } from '../../lib/digits';

interface BusinessTeamProps {
  onNavigate: (page: string) => void;
}

export default function BusinessTeam({ onNavigate }: BusinessTeamProps) {
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  
  const [businessId, setBusinessId] = useState('');
  const [businessName, setBusinessName] = useState('');
  
  const [teamMembers, setTeamMembers] = useState<BusinessTeamMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<BusinessInvitation[]>([]);

  const [phone, setPhone] = useState('');
  const [label, setLabel] = useState('');
  
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadTeamData = async () => {
    setLoading(true);
    setError(null);
    try {
      const contexts = await getUserBusinessContexts();
      const currentBusiness = contexts.owned_businesses?.[0] || contexts.team_businesses?.[0];
      
      if (!currentBusiness) {
        throw new Error('لم يتم العثور على نشاط تجاري نشط.');
      }

      setBusinessId(currentBusiness.id);
      setBusinessName(currentBusiness.name);

      // Load mock/real team members from current contexts 
      // In this version, we will populate members from the list of owned/managed businesses
      setPendingInvites(contexts.pending_invitations || []);

      // If database contains team listing, we can query it. In this first phase, we will display invitation list
      // and list members if any context exists.
    } catch (err: any) {
      setError(err.message || 'فشل في تحميل بيانات الفريق.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTeamData();
  }, []);

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone) return;

    const cleanPhone = toLatinDigits(phone.trim().replace(/\+/g, ''));
    const phoneRegex = /^967\d{9}$/;
    if (!phoneRegex.test(cleanPhone)) {
      setError('رقم الهاتف يجب أن يكون بالصيغة الدولية اليمنية (9677xxxxxxxx).');
      return;
    }

    setInviting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      await createBusinessTeamInvitation(businessId, cleanPhone, label.trim() || null);
      setSuccessMsg(`تم إرسال دعوة الانضمام بنجاح إلى الرقم: ${cleanPhone}`);
      setPhone('');
      setLabel('');
      // Reload lists
      loadTeamData();
    } catch (err: any) {
      setError(err.message || 'فشل في إرسال دعوة الانضمام.');
    } finally {
      setInviting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-3 font-arabic">
        <Loader2 className="w-6 h-6 text-slate-800 animate-spin" />
        <span className="text-xs text-slate-500">جاري تحميل لوحة أعضاء الفريق...</span>
      </div>
    );
  }

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
          <h1 className="text-sm font-bold text-slate-900">فريق عمل {businessName}</h1>
          <p className="text-[10px] text-slate-500">دعوة الموظفين، المحاسبين، وأمناء الصناديق لتسجيل عمليات الدفع</p>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-xs text-rose-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-xs text-emerald-800 flex items-start gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Invite Member Section */}
      <div className="bg-white rounded-3xl border border-slate-200/60 p-5 space-y-4 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-slate-900 text-white flex items-center justify-center">
            <UserPlus className="w-3.5 h-3.5" />
          </div>
          <h2 className="text-xs font-bold text-slate-900">إضافة عضو جديد للفريق</h2>
        </div>

        <form onSubmit={handleSendInvite} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-600 block">رقم جوال العضو</label>
              <input
                type="tel"
                required
                placeholder="967777123456"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200/80 rounded-xl py-2.5 px-3 focus:outline-none focus:border-slate-400 focus:bg-white transition-all text-left font-mono"
                dir="ltr"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-600 block">اسم المسمى الوظيفي <span className="text-slate-400 font-normal">(اختياري)</span></label>
              <input
                type="text"
                placeholder="مثال: محاسب، كاشير"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200/80 rounded-xl py-2.5 px-3 focus:outline-none focus:border-slate-400 focus:bg-white transition-all text-right"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={inviting}
            className="w-full bg-[#111111] hover:bg-black text-white text-xs font-bold py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {inviting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Plus className="w-4 h-4" />
                <span>إرسال دعوة الانضمام</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Pending Invitations list */}
      <div className="bg-white rounded-3xl border border-slate-200/60 p-5 space-y-4 shadow-sm">
        <h2 className="text-xs font-bold text-slate-900 flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-400" />
          <span>الدعوات النشطة والمعلقة</span>
        </h2>

        {pendingInvites.length === 0 ? (
          <p className="text-[10px] text-slate-400 leading-normal text-center py-2">
            لا توجد أي دعوات معلقة حاليًا.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {pendingInvites.map((invite) => (
              <div key={invite.id} className="py-2.5 flex items-center justify-between first:pt-0 last:pb-0 text-right">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-900">{invite.invited_phone}</span>
                    <span className="bg-amber-50 text-amber-700 text-[8px] font-bold px-1.5 py-0.5 rounded">معلقة</span>
                  </div>
                  <span className="text-[9px] text-slate-400 block">الدور: {invite.role}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 select-all">{invite.token.slice(0, 8)}...</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
