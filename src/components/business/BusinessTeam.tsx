import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  AlertTriangle,
  Activity,
  CheckCircle2,
  Crown,
  Loader2,
  Phone,
  Plus,
  Save,
  Search,
  ShieldCheck,
  UserMinus,
  UserPlus,
  UserX,
  Users
} from 'lucide-react';
import { getUserBusinessContexts } from '../../lib/businessApi';
import {
  DEFAULT_TEAM_PERMISSIONS,
  createBusinessTeamInvitationV2,
  getBusinessTeamV2,
  updateBusinessTeamMemberPermissions,
  updateBusinessTeamMemberStatusV2,
  type BusinessTeamMemberV2,
  type BusinessTeamPermissionKey,
  type BusinessTeamPermissions,
  type BusinessTeamInvitationV2
} from '../../lib/businessTeamApi';
import { toLatinDigits } from '../../lib/digits';
import BusinessTeamMemberOperations from './BusinessTeamMemberOperations';
import BusinessTeamProPurchase from './BusinessTeamProPurchase';

interface BusinessTeamProps {
  onNavigate: (page: string, token?: string) => void;
  businessId?: string;
  businessName?: string;
}

const PERMISSION_LABELS: Record<BusinessTeamPermissionKey, string> = {
  view_customers: 'عرض العملاء',
  contact_customers: 'التواصل مع العملاء',
  manage_catalog: 'إدارة الكتالوج',
  view_reports: 'عرض التقارير',
  link_operations: 'إضافة العمليات إلى النشاط'
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

function normalizedPermissions(member: BusinessTeamMemberV2): BusinessTeamPermissions {
  return { ...DEFAULT_TEAM_PERMISSIONS, ...(member.permissions || {}) };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

export default function BusinessTeam({ onNavigate, businessId: providedBusinessId, businessName: providedBusinessName }: BusinessTeamProps) {
  const [loading, setLoading] = useState(true);
  const [businessId, setBusinessId] = useState(providedBusinessId || '');
  const [businessName, setBusinessName] = useState(providedBusinessName || '');
  const [members, setMembers] = useState<BusinessTeamMemberV2[]>([]);
  const [pendingInvites, setPendingInvites] = useState<BusinessTeamInvitationV2[]>([]);
  const [search, setSearch] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<BusinessTeamMemberV2 | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editPermissions, setEditPermissions] = useState<BusinessTeamPermissions>(DEFAULT_TEAM_PERMISSIONS);
  const [savingMember, setSavingMember] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [operationsMember, setOperationsMember] = useState<BusinessTeamMemberV2 | null>(null);
  const [proPurchaseMemberId, setProPurchaseMemberId] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const resolveBusiness = async () => {
    if (providedBusinessId) {
      return { id: providedBusinessId, name: providedBusinessName || '' };
    }
    const contexts = await getUserBusinessContexts();
    const current = contexts.owned_businesses?.[0] || null;
    if (!current) throw new Error('لا يوجد نشاط مملوك متاح لإدارة الفريق.');
    return { id: current.id, name: current.name };
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const current = await resolveBusiness();
      setBusinessId(current.id);
      setBusinessName(current.name);
      const data = await getBusinessTeamV2(current.id);
      setMembers(data.items);
      setPendingInvites(data.pending_invitations);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحميل فريق العمل.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [providedBusinessId]);

  const filteredMembers = useMemo(() => {
    const term = toLatinDigits(search).trim().toLowerCase();
    if (!term) return members;
    return members.filter((member) => {
      const name = member.profile?.full_name || '';
      const phoneValue = toLatinDigits(member.profile?.phone || '');
      const title = member.job_title || member.label || '';
      return name.toLowerCase().includes(term) || phoneValue.includes(term) || title.toLowerCase().includes(term);
    });
  }, [members, search]);

  const activeCount = members.filter((member) => member.status === 'active').length;
  const suspendedCount = members.filter((member) => member.status === 'suspended').length;
  const proCount = members.filter((member) => member.pro_subscription).length;

  const submitInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanPhone = toLatinDigits(phone).replace(/\D/g, '');
    if (!/^9677\d{8}$/.test(cleanPhone)) {
      setError('رقم الهاتف يجب أن يكون بالصيغة 9677XXXXXXXX.');
      return;
    }
    if (!businessId) return;

    setInviting(true);
    setError(null);
    setSuccess(null);
    try {
      await createBusinessTeamInvitationV2(businessId, cleanPhone, jobTitle.trim() || null);
      setPhone('');
      setJobTitle('');
      setInviteOpen(false);
      setSuccess('تم إنشاء دعوة الموظف.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر إنشاء الدعوة.');
    } finally {
      setInviting(false);
    }
  };

  const openEditor = (member: BusinessTeamMemberV2) => {
    setEditing(member);
    setEditTitle(member.job_title || member.label || '');
    setEditPermissions(normalizedPermissions(member));
    setError(null);
    setSuccess(null);
  };

  const savePermissions = async () => {
    if (!businessId || !editing) return;
    setSavingMember(true);
    setError(null);
    try {
      await updateBusinessTeamMemberPermissions(businessId, editing.user_id, editTitle, editPermissions);
      setEditing(null);
      setSuccess('تم حفظ المسمى الوظيفي والصلاحيات.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر حفظ صلاحيات الموظف.');
    } finally {
      setSavingMember(false);
    }
  };

  const changeStatus = async (member: BusinessTeamMemberV2, action: 'suspended' | 'reactivated' | 'removed') => {
    if (!businessId) return;
    setActionLoading(member.user_id);
    setError(null);
    setSuccess(null);
    try {
      await updateBusinessTeamMemberStatusV2(businessId, member.user_id, action);
      setSuccess(action === 'suspended' ? 'تم تعليق الموظف.' : action === 'reactivated' ? 'تمت إعادة تفعيل الموظف.' : 'تمت إزالة الموظف.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحديث العضوية.');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4 font-arabic text-right" dir="rtl">
      <header className="flex items-start justify-between gap-3 px-1">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-950">فريق العمل</h2>
          <p className="mt-1 text-[11px] text-slate-500">موظفو {businessName || 'النشاط'} ومسمياتهم وصلاحياتهم التشغيلية</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button onClick={() => setProPurchaseMemberId(null)} className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[10px] font-bold text-emerald-800">
            <Crown className="h-4 w-4" />تفعيل Pro
          </button>
          <button onClick={() => setInviteOpen((value) => !value)} className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2.5 text-[10px] font-bold text-white">
            <UserPlus className="h-4 w-4" />دعوة
          </button>
        </div>
      </header>

      {error && <div className="flex gap-2 rounded-2xl border border-rose-100 bg-rose-50 p-3 text-xs text-rose-700"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>}
      {success && <div className="flex gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-700"><CheckCircle2 className="h-4 w-4 shrink-0" />{success}</div>}

      <div className="grid grid-cols-4 gap-2">
        <div className="rounded-2xl bg-white p-3 text-center"><strong className="block text-lg">{formatNumber(members.length)}</strong><span className="text-[9px] text-slate-400">الموظفون</span></div>
        <div className="rounded-2xl bg-white p-3 text-center"><strong className="block text-lg">{formatNumber(activeCount)}</strong><span className="text-[9px] text-slate-400">نشط</span></div>
        <div className="rounded-2xl bg-white p-3 text-center"><strong className="block text-lg">{formatNumber(proCount)}</strong><span className="text-[9px] text-slate-400">Pro</span></div>
        <div className="rounded-2xl bg-white p-3 text-center"><strong className="block text-lg">{formatNumber(pendingInvites.length)}</strong><span className="text-[9px] text-slate-400">دعوات</span></div>
      </div>

      {inviteOpen && (
        <form onSubmit={submitInvite} className="grid gap-3 border-y border-slate-200 bg-white px-3 py-4 sm:grid-cols-2 sm:rounded-2xl sm:border">
          <label className="space-y-1 text-[10px] font-bold text-slate-600">رقم الجوال
            <div className="relative"><Phone className="absolute right-3 top-3.5 h-4 w-4 text-slate-400" /><input value={phone} onChange={(event) => setPhone(toLatinDigits(event.target.value).replace(/\D/g, '').slice(0, 12))} placeholder="9677XXXXXXXX" dir="ltr" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pr-10 pl-3 text-left font-mono text-xs" /></div>
          </label>
          <label className="space-y-1 text-[10px] font-bold text-slate-600">المسمى الوظيفي
            <input value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} maxLength={80} placeholder="مثال: كاشير، محاسب" className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs" />
          </label>
          <button disabled={inviting || !phone} className="flex justify-center gap-2 rounded-xl bg-slate-900 p-3 text-xs font-bold text-white disabled:bg-slate-300 sm:col-span-2">
            {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}إرسال الدعوة
          </button>
        </form>
      )}

      <div className="relative"><Search className="absolute right-3 top-3.5 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث بالاسم أو الرقم أو المسمى..." className="w-full rounded-2xl border border-slate-200 bg-white py-3 pr-10 pl-3 text-xs" /></div>

      <section className="divide-y divide-slate-100 border-y border-slate-200 bg-white sm:rounded-2xl sm:border">
        {filteredMembers.length === 0 ? (
          <div className="py-12 text-center"><Users className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-xs text-slate-400">لا يوجد موظفون مطابقون.</p></div>
        ) : filteredMembers.map((member) => (
          <article key={member.membership_id} className="space-y-3 px-3 py-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100"><ShieldCheck className="h-5 w-5 text-slate-600" /></div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-xs font-bold">{member.profile?.full_name || 'مستخدم سند'}</h3><span className={`rounded-full px-2 py-0.5 text-[8px] font-bold ${member.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{member.status === 'active' ? 'نشط' : 'معلّق'}</span></div>
                <p className="mt-1 text-[10px] text-slate-500">{member.job_title || 'موظف'} · <bdi dir="ltr">{toLatinDigits(member.profile?.phone || 'بدون رقم')}</bdi></p>
                <p className="mt-1 text-[9px] text-slate-400">انضم في {formatDate(member.created_at)}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {member.pro_subscription ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-[8px] font-bold text-emerald-700">
                      سند Pro · حتى {formatDate(member.pro_subscription.current_period_end)}
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[8px] font-bold text-slate-500">الخطة الأساسية</span>
                  )}
                  <span className="rounded-full bg-blue-50 px-2 py-1 text-[8px] font-bold text-blue-700">
                    ربط {formatNumber(member.activity?.linked_count || 0)}
                  </span>
                  <span className="rounded-full bg-violet-50 px-2 py-1 text-[8px] font-bold text-violet-700">
                    تحقق {formatNumber(member.activity?.verified_count || 0)}
                  </span>
                </div>
              </div>
              <button onClick={() => openEditor(member)} className="rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-bold">الصلاحيات</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setOperationsMember(member)} className="flex items-center justify-center gap-1 rounded-xl border border-blue-200 py-2.5 text-[10px] font-bold text-blue-700">
                <Activity className="h-4 w-4" />سجل العمليات
              </button>
              <button disabled={member.status !== 'active'} onClick={() => setProPurchaseMemberId(member.user_id)} className="flex items-center justify-center gap-1 rounded-xl border border-emerald-200 py-2.5 text-[10px] font-bold text-emerald-700 disabled:border-slate-200 disabled:text-slate-300">
                <Crown className="h-4 w-4" />{member.pro_subscription ? 'تجديد Pro' : 'تفعيل Pro'}
              </button>
              {member.status === 'active' ? (
                <button disabled={actionLoading === member.user_id} onClick={() => void changeStatus(member, 'suspended')} className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-amber-200 py-2.5 text-[10px] font-bold text-amber-700"><UserX className="h-4 w-4" />تعليق</button>
              ) : (
                <button disabled={actionLoading === member.user_id} onClick={() => void changeStatus(member, 'reactivated')} className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-emerald-200 py-2.5 text-[10px] font-bold text-emerald-700"><ShieldCheck className="h-4 w-4" />إعادة تفعيل</button>
              )}
              <button disabled={actionLoading === member.user_id} onClick={() => window.confirm('إزالة هذا الموظف من النشاط؟') && void changeStatus(member, 'removed')} className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-rose-200 py-2.5 text-[10px] font-bold text-rose-700"><UserMinus className="h-4 w-4" />إزالة</button>
            </div>
          </article>
        ))}
      </section>

      {suspendedCount > 0 && <p className="px-1 text-[10px] text-slate-400">يوجد {formatNumber(suspendedCount)} موظف معلّق لا يملك صلاحيات تشغيلية فعالة.</p>}

      {pendingInvites.length > 0 && (
        <section className="space-y-2"><h3 className="px-1 text-xs font-bold">الدعوات المعلقة</h3>{pendingInvites.map((invite) => <div key={invite.invitation_id} className="rounded-2xl bg-white p-3"><strong className="block font-mono text-xs" dir="ltr">{invite.invited_phone}</strong><span className="mt-1 block text-[10px] text-slate-500">{invite.job_title || 'موظف'} · تنتهي {formatDate(invite.expires_at)}</span></div>)}</section>
      )}

      {editing && (
        <div className="fixed inset-0 z-[120] flex items-end bg-slate-950/60 sm:items-center sm:justify-center">
          <button className="absolute inset-0" onClick={() => setEditing(null)} aria-label="إغلاق" />
          <section className="relative z-10 w-full rounded-t-[28px] bg-white p-4 pb-[calc(16px+env(safe-area-inset-bottom))] sm:max-w-lg sm:rounded-3xl">
            <h3 className="text-sm font-bold">صلاحيات {editing.profile?.full_name || 'الموظف'}</h3>
            <label className="mt-4 block space-y-1 text-[10px] font-bold text-slate-600">المسمى الوظيفي<input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs" /></label>
            <div className="mt-4 space-y-2">{(Object.keys(PERMISSION_LABELS) as BusinessTeamPermissionKey[]).map((key) => <label key={key} className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-xs"><span>{PERMISSION_LABELS[key]}</span><input type="checkbox" checked={editPermissions[key]} onChange={(event) => setEditPermissions((current) => ({ ...current, [key]: event.target.checked }))} /></label>)}</div>
            <div className="mt-4 flex gap-2"><button onClick={() => setEditing(null)} className="flex-1 rounded-xl border p-3 text-xs">إلغاء</button><button disabled={savingMember} onClick={() => void savePermissions()} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 p-3 text-xs font-bold text-white">{savingMember ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}حفظ</button></div>
          </section>
        </div>
      )}

      {operationsMember && (
        <BusinessTeamMemberOperations
          businessId={businessId}
          memberUserId={operationsMember.user_id}
          memberName={operationsMember.profile?.full_name || 'الموظف'}
          onClose={() => setOperationsMember(null)}
          onOpenOperation={(token) => {
            setOperationsMember(null);
            onNavigate('details', token);
          }}
        />
      )}

      {proPurchaseMemberId !== undefined && (
        <BusinessTeamProPurchase
          businessId={businessId}
          defaultMemberUserId={proPurchaseMemberId}
          onSubmitted={() => setSuccess('تم إنشاء طلب تفعيل سند Pro للفريق.')}
          onClose={() => {
            setProPurchaseMemberId(undefined);
            void load();
          }}
        />
      )}
    </div>
  );
}
