import React, { useState, useEffect } from 'react';
import { 
  getUserBusinessContexts, createBusinessTeamInvitation, 
  getBusinessTeam, updateBusinessTeamMemberStatus,
  BusinessTeamMember, BusinessInvitation 
} from '../../lib/businessApi';
import { 
  ArrowRight, Users, Plus, Loader2, AlertTriangle, 
  CheckCircle2, Clock, Phone, UserPlus, RefreshCw, UserCheck, ShieldAlert
} from 'lucide-react';
import { toLatinDigits, formatYemeniDisplay } from '../../lib/digits';

interface BusinessTeamProps {
  onNavigate: (page: string) => void;
}

export default function BusinessTeam({ onNavigate }: BusinessTeamProps) {
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  
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
      setPendingInvites(contexts.pending_invitations || []);

      // Fetch actual active team members
      const members = await getBusinessTeam(currentBusiness.id);
      setTeamMembers(Array.isArray(members) ? members : []);
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
      setSuccessMsg(`تم إرسال دعوة الانضمام بنجاح إلى الرقم: ${toLatinDigits(cleanPhone)}`);
      setPhone('');
      setLabel('');
      await loadTeamData();
    } catch (err: any) {
      setError(err.message || 'فشل في إرسال دعوة الانضمام.');
    } finally {
      setInviting(false);
    }
  };

  const handleStatusChange = async (member: BusinessTeamMember, action: 'suspended' | 'reactivated' | 'removed') => {
    const actionAr = action === 'suspended' ? 'تعليق' : action === 'reactivated' ? 'تنشيط' : 'إلغاء عضوية';
    const confirm = window.confirm(`هل أنت متأكد من رغبتك في ${actionAr} العضو ${member.profile?.full_name || member.profile?.phone || ''}؟`);
    if (!confirm) return;

    setActionLoading(member.user_id);
    setError(null);
    setSuccessMsg(null);

    try {
      await updateBusinessTeamMemberStatus(businessId, member.user_id, action);
      setSuccessMsg(`تمت عملية ${actionAr} بنجاح.`);
      await loadTeamData();
    } catch (err: any) {
      setError(err.message || `تعذر تنفيذ عملية ${actionAr} للعضو.`);
    } finally {
      setActionLoading(null);
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

  const membersList = Array.isArray(teamMembers) ? teamMembers : [];
  const invitesList = Array.isArray(pendingInvites) ? pendingInvites : [];

  return (
    <div className="space-y-6 font-arabic text-right min-h-screen bg-slate-50/50 pb-12" dir="rtl">
      {/* Visual Workspace Header */}
      <div className="bg-slate-900 text-white p-6 rounded-b-[2rem] shadow-md space-y-4">
        <div className="flex items-center gap-3">
          <button 
            type="button"
            onClick={() => onNavigate('business-manage')} 
            className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-all border border-white/5 text-white"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
          <div>
            <span className="text-[9px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded border border-emerald-500/30 uppercase tracking-wider block w-max mb-1">مساحة الأعمال</span>
            <h1 className="text-sm font-bold leading-tight font-arabic">فريق عمل {businessName || 'النشاط التجاري'}</h1>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 space-y-5">

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-xs text-rose-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-xs text-emerald-800 flex items-start gap-2 animate-scale-up">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Add Team Member */}
      <div className="bg-white rounded-3xl border border-slate-200/60 p-5 space-y-4 shadow-sm">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
          <div className="w-7 h-7 rounded bg-slate-900 text-white flex items-center justify-center">
            <UserPlus className="w-4 h-4" />
          </div>
          <h2 className="text-xs font-bold text-slate-900">إضافة عضو جديد للفريق</h2>
        </div>

        <form onSubmit={handleSendInvite} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-600 block">رقم جوال العضو</label>
              <input
                type="tel"
                required
                placeholder="967777123456"
                value={phone}
                onChange={(e) => setPhone(toLatinDigits(e.target.value))}
                className="w-full text-xs bg-slate-50 border border-slate-200/80 rounded-xl py-2.5 px-3 focus:outline-none focus:border-slate-400 focus:bg-white transition-all text-left font-mono"
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-600 block">المسمى الوظيفي <span className="text-slate-400 font-normal">(اختياري)</span></label>
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
            className="w-full bg-[#111111] hover:bg-black text-white text-xs font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
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

      {/* Active Team Members List */}
      <div className="bg-white rounded-3xl border border-slate-200/60 p-5 space-y-4 shadow-sm">
        <h2 className="text-xs font-bold text-slate-900 flex items-center gap-2 pb-2 border-b border-slate-100">
          <Users className="w-4.5 h-4.5 text-slate-700" />
          <span>أعضاء فريق العمل الحاليين</span>
        </h2>

        {membersList.length === 0 ? (
          <p className="text-[10px] text-slate-400 leading-normal text-center py-4 font-arabic">
            لا يوجد أعضاء فريق حاليًا. قم بدعوة كاشير أو مدير لبدء التوثيق المشترك.
          </p>
        ) : (
          <div className="space-y-3.5">
            {membersList.map((member) => {
              const isOwner = member.role === 'owner';
              const nameDisplay = member.profile?.full_name || 'عضو في فريق النشاط';
              const phoneDisplay = member.profile?.phone ? formatYemeniDisplay(member.profile.phone) : '—';
              const roleDisplay = member.role === 'owner' ? 'المالك' : member.role === 'manager' ? 'مدير' : 'كاشير';

              return (
                <div key={member.id} className="bg-slate-50 border border-slate-150 p-3.5 rounded-2xl flex flex-col gap-3 justify-between sm:flex-row sm:items-center">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 font-arabic">{nameDisplay}</span>
                      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${
                        isOwner ? 'bg-slate-950 text-white' : 'bg-slate-200 text-slate-700'
                      }`}>
                        {roleDisplay}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-slate-400">
                      <span className="font-mono">{toLatinDigits(phoneDisplay)}</span>
                      {member.joined_at && (
                        <span>انضم في: {toLatinDigits(new Date(member.joined_at).toLocaleDateString())}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 justify-end">
                    {actionLoading === member.user_id ? (
                      <Loader2 className="w-4 h-4 animate-spin text-slate-800" />
                    ) : !isOwner ? (
                      <>
                        <button
                          onClick={() => handleStatusChange(member, 'removed')}
                          className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-100/50 text-[9px] font-bold py-1.5 px-3 rounded-lg transition-all"
                        >
                          إلغاء عضوية
                        </button>
                      </>
                    ) : (
                      <span className="text-[9px] text-slate-400 font-arabic font-semibold px-2">مالك النشاط</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pending Invitations list */}
      <div className="bg-white rounded-3xl border border-slate-200/60 p-5 space-y-4 shadow-sm">
        <h2 className="text-xs font-bold text-slate-900 flex items-center gap-2 pb-2 border-b border-slate-100">
          <Clock className="w-4 h-4 text-slate-400" />
          <span>الدعوات النشطة والمعلقة</span>
        </h2>

        {invitesList.length === 0 ? (
          <p className="text-[10px] text-slate-400 leading-normal text-center py-2 font-arabic">
            لا توجد أي دعوات معلقة حاليًا.
          </p>
        ) : (
          <div className="divide-y divide-slate-150">
            {invitesList.map((invite) => (
              <div key={invite.id} className="py-3 flex items-center justify-between first:pt-0 last:pb-0 text-right">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900 font-mono">{toLatinDigits(invite.invited_phone)}</span>
                    <span className="bg-amber-50 text-amber-700 text-[8px] font-bold px-2 py-0.5 rounded-full border border-amber-100">معلقة</span>
                  </div>
                  <span className="text-[9px] text-slate-400 block font-arabic">الدور المطلوب: {invite.role}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-mono bg-slate-50 border border-slate-200/60 px-2 py-0.5 rounded text-slate-500 select-all">
                    {invite.token.slice(0, 8)}...
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  </div>
);
}
