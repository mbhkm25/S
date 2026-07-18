import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Loader2,
  MoreVertical,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  User,
  UserCheck,
  UserMinus,
  UserPlus,
  UserX,
  Users,
  X
} from 'lucide-react';
import {
  createBusinessTeamInvitation,
  getBusinessTeam,
  getUserBusinessContexts,
  updateBusinessTeamMemberStatus,
  type BusinessInvitation,
  type BusinessTeamMember
} from '../../lib/businessApi';
import { formatYemeniDisplay, toLatinDigits } from '../../lib/digits';

interface BusinessTeamProps {
  onNavigate: (page: string) => void;
}

type MemberAction = 'suspended' | 'reactivated' | 'removed';

type TeamMemberWithStatus = BusinessTeamMember & {
  status?: string | null;
  label?: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return 'غير متوفر';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'غير متوفر';
  return new Intl.DateTimeFormat('ar-YE-u-nu-latn', {
    dateStyle: 'medium',
    timeZone: 'Asia/Aden',
    numberingSystem: 'latn'
  }).format(date);
}

function roleLabel(member: TeamMemberWithStatus) {
  if (member.role === 'owner') return 'مالك النشاط';
  if (member.role === 'manager') return 'مدير';
  if (member.role === 'cashier') return 'كاشير';
  return member.label || 'عضو فريق';
}

function statusLabel(member: TeamMemberWithStatus) {
  if (member.role === 'owner') return 'مالك';
  if (member.status === 'suspended') return 'معلّق';
  return 'نشط';
}

function statusClasses(member: TeamMemberWithStatus) {
  if (member.role === 'owner') return 'border-slate-200 bg-slate-900 text-white';
  if (member.status === 'suspended') return 'border-amber-100 bg-amber-50 text-amber-700';
  return 'border-emerald-100 bg-emerald-50 text-emerald-700';
}

export default function BusinessTeam({ onNavigate: _onNavigate }: BusinessTeamProps) {
  const [loading, setLoading] = useState(true);
  const [businessId, setBusinessId] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [teamMembers, setTeamMembers] = useState<TeamMemberWithStatus[]>([]);
  const [pendingInvites, setPendingInvites] = useState<BusinessInvitation[]>([]);
  const [search, setSearch] = useState('');
  const [selectedMember, setSelectedMember] = useState<TeamMemberWithStatus | null>(null);
  const [showInviteSheet, setShowInviteSheet] = useState(false);
  const [actionSheetMember, setActionSheetMember] = useState<TeamMemberWithStatus | null>(null);
  const [phone, setPhone] = useState('');
  const [label, setLabel] = useState('');
  const [inviting, setInviting] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadTeamData = async () => {
    setLoading(true);
    setError(null);
    try {
      const contexts = await getUserBusinessContexts();
      const currentBusiness = contexts.owned_businesses?.[0] || contexts.team_businesses?.[0];
      if (!currentBusiness) throw new Error('لم يتم العثور على نشاط تجاري نشط.');

      setBusinessId(currentBusiness.id);
      setBusinessName(currentBusiness.name);
      setPendingInvites(contexts.pending_invitations || []);
      const members = await getBusinessTeam(currentBusiness.id);
      setTeamMembers(Array.isArray(members) ? members as TeamMemberWithStatus[] : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'فشل تحميل بيانات الفريق.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTeamData();
  }, []);

  useEffect(() => {
    const sheetOpen = showInviteSheet || Boolean(actionSheetMember);
    if (!sheetOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showInviteSheet, actionSheetMember]);

  const counts = useMemo(() => {
    const active = teamMembers.filter((member) => member.status !== 'suspended').length;
    const suspended = teamMembers.filter((member) => member.status === 'suspended').length;
    return { total: teamMembers.length, active, suspended, pending: pendingInvites.length };
  }, [pendingInvites.length, teamMembers]);

  const filteredMembers = useMemo(() => {
    const term = toLatinDigits(search).trim().toLowerCase();
    if (!term) return teamMembers;
    return teamMembers.filter((member) => {
      const name = member.profile?.full_name || '';
      const phoneValue = toLatinDigits(member.profile?.phone || '');
      return name.toLowerCase().includes(term) || phoneValue.includes(term) || roleLabel(member).includes(term);
    });
  }, [search, teamMembers]);

  const handleSendInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanPhone = toLatinDigits(phone.trim().replace(/\+/g, '')).replace(/\D/g, '');
    if (!/^9677\d{8}$/.test(cleanPhone)) {
      setError('رقم الهاتف يجب أن يكون بالصيغة الدولية اليمنية: 9677XXXXXXXX.');
      return;
    }

    setInviting(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await createBusinessTeamInvitation(businessId, cleanPhone, label.trim() || null);
      setSuccessMsg('تم إرسال دعوة الانضمام بنجاح.');
      setPhone('');
      setLabel('');
      setShowInviteSheet(false);
      await loadTeamData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'فشل إرسال دعوة الانضمام.');
    } finally {
      setInviting(false);
    }
  };

  const executeMemberAction = async (action: MemberAction) => {
    if (!actionSheetMember) return;
    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await updateBusinessTeamMemberStatus(businessId, actionSheetMember.user_id, action);
      const actionText = action === 'suspended' ? 'تعليق العضوية' : action === 'reactivated' ? 'إعادة تنشيط العضوية' : 'إزالة العضو';
      setSuccessMsg(`تم ${actionText} بنجاح.`);
      setActionSheetMember(null);
      setSelectedMember(null);
      await loadTeamData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تنفيذ الإجراء المطلوب.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 font-arabic">
        <Loader2 className="h-6 w-6 animate-spin text-slate-800" />
        <span className="text-xs text-slate-500">جاري تحميل فريق العمل...</span>
      </div>
    );
  }

  if (selectedMember) {
    const isOwner = selectedMember.role === 'owner';
    const suspended = selectedMember.status === 'suspended';
    return (
      <div className="space-y-5 font-arabic text-right" dir="rtl">
        <header className="flex items-start gap-3 border-b border-slate-200 pb-4">
          <button
            type="button"
            onClick={() => setSelectedMember(null)}
            className="mt-0.5 rounded-xl border border-slate-200 bg-white p-2.5 text-slate-700 transition hover:bg-slate-50"
            aria-label="العودة إلى الفريق"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-bold text-slate-950">{selectedMember.profile?.full_name || 'عضو في فريق النشاط'}</h2>
              <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${statusClasses(selectedMember)}`}>
                {statusLabel(selectedMember)}
              </span>
            </div>
            <p className="mt-1 font-mono text-[11px] text-slate-500" dir="ltr">
              {toLatinDigits(selectedMember.profile?.phone || 'رقم الهاتف غير متوفر')}
            </p>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-x-5 gap-y-4 border-b border-slate-200 pb-5">
          <div>
            <span className="block text-[9px] font-bold text-slate-400">الدور</span>
            <span className="mt-1 block text-xs font-bold text-slate-800">{roleLabel(selectedMember)}</span>
          </div>
          <div>
            <span className="block text-[9px] font-bold text-slate-400">تاريخ الانضمام</span>
            <span className="mt-1 block text-xs font-bold text-slate-800">{formatDate(selectedMember.joined_at)}</span>
          </div>
          <div>
            <span className="block text-[9px] font-bold text-slate-400">حالة العضوية</span>
            <span className="mt-1 block text-xs font-bold text-slate-800">{statusLabel(selectedMember)}</span>
          </div>
          <div>
            <span className="block text-[9px] font-bold text-slate-400">نوع الوصول</span>
            <span className="mt-1 block text-xs font-bold text-slate-800">{isOwner ? 'وصول كامل' : 'وصول تشغيلي'}</span>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-bold text-slate-900">إدارة العضوية</h3>
          {isOwner ? (
            <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-6 text-slate-600">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-700" />
              لا يمكن تعديل عضوية مالك النشاط من هذه الواجهة.
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setActionSheetMember(selectedMember)}
              className="flex w-full items-center justify-between border-y border-slate-100 py-4 text-right transition hover:bg-slate-50"
            >
              <div>
                <p className="text-xs font-bold text-slate-800">إجراءات العضو</p>
                <p className="mt-1 text-[10px] text-slate-400">{suspended ? 'إعادة التنشيط أو إزالة العضوية' : 'تعليق الوصول أو إزالة العضوية'}</p>
              </div>
              <ChevronLeft className="h-4 w-4 text-slate-400" />
            </button>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-5 font-arabic text-right" dir="rtl">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-950">فريق العمل</h2>
          <p className="mt-1 text-[11px] text-slate-500">إدارة أعضاء {businessName || 'النشاط'} ودعوات الانضمام والصلاحيات التشغيلية</p>
        </div>
        <button
          type="button"
          onClick={() => setShowInviteSheet(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2.5 text-[10px] font-bold text-white shadow-sm transition hover:bg-black"
        >
          <UserPlus className="h-4 w-4" />
          دعوة عضو
        </button>
      </header>

      {error && (
        <div className="flex items-start gap-2 rounded-2xl border border-rose-100 bg-rose-50 p-3 text-xs text-rose-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="flex items-start gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-700">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {[
          { label: 'كل الأعضاء', value: counts.total },
          { label: 'النشطون', value: counts.active },
          { label: 'المعلّقون', value: counts.suspended },
          { label: 'الدعوات', value: counts.pending }
        ].map((item) => (
          <div key={item.label} className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-600">
            {item.label} <span className="mr-1 font-mono text-slate-900">{toLatinDigits(String(item.value))}</span>
          </div>
        ))}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="ابحث بالاسم أو الهاتف أو الدور"
          className="w-full rounded-2xl border border-slate-200 bg-white py-3 pr-10 pl-3 text-xs outline-none transition focus:border-slate-400"
        />
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-900">أعضاء الفريق</h3>
          <button type="button" onClick={() => void loadTeamData()} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="تحديث">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {filteredMembers.length === 0 ? (
          <div className="border-y border-slate-100 py-10 text-center">
            <Users className="mx-auto h-7 w-7 text-slate-300" />
            <p className="mt-2 text-[11px] text-slate-400">لا توجد نتائج مطابقة.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 border-y border-slate-100">
            {filteredMembers.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => setSelectedMember(member)}
                className="flex w-full items-center gap-3 py-3.5 text-right transition hover:bg-slate-50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                  {member.role === 'owner' ? <ShieldCheck className="h-5 w-5" /> : <User className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-xs font-bold text-slate-900">{member.profile?.full_name || 'عضو في فريق النشاط'}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-[8px] font-bold ${statusClasses(member)}`}>{statusLabel(member)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-slate-400">
                    <span>{roleLabel(member)}</span>
                    <span className="font-mono" dir="ltr">{toLatinDigits(formatYemeniDisplay(member.profile?.phone || '')) || '—'}</span>
                  </div>
                </div>
                <ChevronLeft className="h-4 w-4 shrink-0 text-slate-300" />
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-900">الدعوات المعلقة</h3>
          <span className="rounded-full bg-amber-50 px-2 py-1 font-mono text-[9px] font-bold text-amber-700">{toLatinDigits(String(pendingInvites.length))}</span>
        </div>
        {pendingInvites.length === 0 ? (
          <p className="border-y border-slate-100 py-5 text-[11px] text-slate-400">لا توجد دعوات معلقة حاليًا.</p>
        ) : (
          <div className="divide-y divide-slate-100 border-y border-slate-100">
            {pendingInvites.map((invite) => (
              <div key={invite.id} className="flex items-center gap-3 py-3.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                  <Clock className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs font-bold text-slate-800" dir="ltr">{toLatinDigits(invite.invited_phone)}</p>
                  <p className="mt-1 text-[9px] text-slate-400">{invite.role || 'عضو فريق'} · بانتظار القبول</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {showInviteSheet && (
        <div className="fixed inset-0 z-[80] flex items-end bg-slate-950/55 backdrop-blur-sm" onClick={() => setShowInviteSheet(false)}>
          <section className="flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mx-auto mt-3 h-1.5 w-16 rounded-full bg-slate-200" />
            <header className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-sm font-bold text-slate-950">دعوة عضو جديد</h3>
                <p className="mt-1 text-[10px] text-slate-400">أرسل دعوة إلى مستخدم سند للانضمام إلى فريق النشاط.</p>
              </div>
              <button type="button" onClick={() => setShowInviteSheet(false)} className="rounded-xl border border-slate-200 p-2 text-slate-500">
                <X className="h-4 w-4" />
              </button>
            </header>
            <form onSubmit={handleSendInvite} className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold text-slate-600">رقم الجوال الدولي</label>
                  <div className="relative">
                    <Phone className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(event) => setPhone(toLatinDigits(event.target.value).replace(/\D/g, '').slice(0, 12))}
                      placeholder="9677XXXXXXXX"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pr-10 pl-3 text-left font-mono text-xs outline-none focus:border-slate-400 focus:bg-white"
                      dir="ltr"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold text-slate-600">المسمى الوظيفي <span className="font-normal text-slate-400">(اختياري)</span></label>
                  <input
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    placeholder="مثال: محاسب، كاشير، مدير فرع"
                    maxLength={80}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs outline-none focus:border-slate-400 focus:bg-white"
                  />
                </div>
              </div>
              <div className="h-24" />
            </form>
            <footer className="shrink-0 border-t border-slate-100 bg-white px-5 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <button type="submit" form="" onClick={(event) => void handleSendInvite(event as unknown as React.FormEvent)} disabled={inviting || !phone} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 py-3.5 text-xs font-bold text-white disabled:bg-slate-300">
                {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                إرسال دعوة الانضمام
              </button>
            </footer>
          </section>
        </div>
      )}

      {actionSheetMember && (
        <div className="fixed inset-0 z-[80] flex items-end bg-slate-950/55 backdrop-blur-sm" onClick={() => setActionSheetMember(null)}>
          <section className="w-full rounded-t-[2rem] bg-white px-5 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mx-auto h-1.5 w-16 rounded-full bg-slate-200" />
            <div className="flex items-start justify-between py-5">
              <div>
                <h3 className="text-sm font-bold text-slate-950">إجراءات العضو</h3>
                <p className="mt-1 text-[10px] text-slate-400">{actionSheetMember.profile?.full_name || actionSheetMember.profile?.phone || 'عضو الفريق'}</p>
              </div>
              <button type="button" onClick={() => setActionSheetMember(null)} className="rounded-xl border border-slate-200 p-2 text-slate-500"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-2">
              {actionSheetMember.status === 'suspended' ? (
                <button type="button" disabled={actionLoading} onClick={() => void executeMemberAction('reactivated')} className="flex w-full items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-right text-xs font-bold text-emerald-800 disabled:opacity-50">
                  <UserCheck className="h-5 w-5" /> إعادة تنشيط العضوية
                </button>
              ) : (
                <button type="button" disabled={actionLoading} onClick={() => void executeMemberAction('suspended')} className="flex w-full items-center gap-3 rounded-2xl border border-amber-100 bg-amber-50 p-4 text-right text-xs font-bold text-amber-800 disabled:opacity-50">
                  <UserX className="h-5 w-5" /> تعليق وصول العضو
                </button>
              )}
              <button type="button" disabled={actionLoading} onClick={() => void executeMemberAction('removed')} className="flex w-full items-center gap-3 rounded-2xl border border-rose-100 bg-rose-50 p-4 text-right text-xs font-bold text-rose-800 disabled:opacity-50">
                {actionLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <UserMinus className="h-5 w-5" />} إزالة العضو من الفريق
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
