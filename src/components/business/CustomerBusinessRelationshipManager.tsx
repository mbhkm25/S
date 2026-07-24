import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowRight, Bell, Check, ChevronDown, Eye, EyeOff,
  Loader2, MessageCircle, Settings2, ShieldCheck, Unlink, X
} from 'lucide-react';
import {
  getMyBusinessRelationshipDetail,
  leaveBusinessAsCustomer,
  updateMyBusinessContactPreferences,
  type BusinessRelationshipPreferences,
  type MyBusinessRelationshipDetail
} from '../../lib/businessRelationshipApi';

interface Props {
  businessId: string;
  businessName: string;
  open?: boolean;
  onClose: () => void;
  onRelationshipEnded?: () => void;
  variant?: 'sheet' | 'page';
}

const REASONS = [
  ['no_longer_customer', 'لم أعد أتعامل مع النشاط'],
  ['too_many_messages', 'لا أرغب في الرسائل'],
  ['joined_by_mistake', 'ارتبطت بالنشاط بالخطأ'],
  ['business_issue', 'لدي مشكلة مع النشاط'],
  ['other', 'سبب آخر']
] as const;

function ToggleRow({ icon, title, description, checked, disabled, onChange }: {
  icon: React.ReactNode; title: string; description: string; checked: boolean;
  disabled?: boolean; onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 border-b border-slate-100 py-4 last:border-b-0">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">{icon}</span>
      <span className="min-w-0 flex-1"><span className="block text-xs font-bold text-slate-900">{title}</span><span className="mt-1 block text-[10px] leading-5 text-slate-500">{description}</span></span>
      <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="relative h-7 w-12 shrink-0 rounded-full bg-slate-200 transition peer-checked:bg-emerald-500 peer-disabled:opacity-50 after:absolute after:right-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:-translate-x-5" />
    </label>
  );
}

export default function CustomerBusinessRelationshipManager({
  businessId, businessName, open = true, onClose, onRelationshipEnded, variant = 'sheet'
}: Props) {
  const [detail, setDetail] = useState<MyBusinessRelationshipDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [reasonCode, setReasonCode] = useState('no_longer_customer');
  const [reasonText, setReasonText] = useState('');

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true); setError(null); setSuccess(null);
    void getMyBusinessRelationshipDetail(businessId)
      .then((value) => { if (active) setDetail(value); })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : 'تعذر تحميل العلاقة.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [businessId, open]);

  const preferences = useMemo<BusinessRelationshipPreferences | null>(() => detail ? ({
    in_app_notifications_enabled: detail.relationship.in_app_notifications_enabled,
    whatsapp_service_enabled: detail.relationship.whatsapp_service_enabled,
    whatsapp_marketing_enabled: detail.relationship.whatsapp_marketing_enabled
  }) : null, [detail]);

  const updateLocal = (key: keyof BusinessRelationshipPreferences, value: boolean) => {
    if (!detail) return;
    setDetail({ ...detail, relationship: { ...detail.relationship, [key]: value } });
    setSuccess(null);
  };

  const savePreferences = async () => {
    if (!preferences || saving) return;
    setSaving(true); setError(null); setSuccess(null);
    try { await updateMyBusinessContactPreferences(businessId, preferences); setSuccess('تم حفظ تفضيلات التواصل.'); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر حفظ التفضيلات.'); }
    finally { setSaving(false); }
  };

  const disableCommunications = async () => {
    if (saving) return;
    setSaving(true); setError(null); setSuccess(null);
    try {
      await leaveBusinessAsCustomer({ businessId, reasonCode: 'communications_disabled', disableCommunicationsOnly: true });
      setDetail((current) => current ? ({ ...current, relationship: { ...current.relationship, in_app_notifications_enabled: false, whatsapp_service_enabled: false, whatsapp_marketing_enabled: false } }) : current);
      setSuccess('تم إيقاف جميع الرسائل دون إنهاء ارتباطك بالنشاط.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر إيقاف الرسائل.'); }
    finally { setSaving(false); }
  };

  const leaveRelationship = async () => {
    if (saving) return;
    setSaving(true); setError(null); setSuccess(null);
    try {
      await leaveBusinessAsCustomer({ businessId, reasonCode, reasonText, disableCommunicationsOnly: false });
      setSuccess('تم فك ارتباطك بالنشاط مع الاحتفاظ بالسجلات السابقة اللازمة.');
      setConfirmLeave(false); onRelationshipEnded?.();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر فك الارتباط.'); }
    finally { setSaving(false); }
  };

  if (!open) return null;
  const page = variant === 'page';
  const shell = page
    ? 'min-h-full w-full bg-slate-50'
    : 'fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-4';
  const panel = page
    ? 'mx-auto w-full max-w-2xl bg-slate-50'
    : 'max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-[2rem] bg-white shadow-2xl sm:rounded-[2rem]';

  return (
    <div className={shell} dir="rtl">
      <div className={panel}>
        <header className={`sticky top-0 z-10 flex items-center gap-3 border-b border-slate-100 bg-white/95 px-4 py-4 backdrop-blur ${page ? '' : ''}`}>
          <button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700" aria-label="رجوع">
            {page ? <ArrowRight className="h-5 w-5" /> : <X className="h-5 w-5" />}
          </button>
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white"><Settings2 className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1"><p className="text-[10px] font-bold text-emerald-600">إدارة العلاقة</p><h2 className="truncate text-sm font-bold text-slate-950">علاقتك بـ {businessName}</h2></div>
        </header>

        <div className="space-y-5 p-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
          {loading ? <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-slate-700" /></div>
          : error && !detail ? <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-xs leading-6 text-rose-700">{error}</div>
          : detail ? <>
            {error && <div className="rounded-2xl bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
            {success && <div className="rounded-2xl bg-emerald-50 p-3 text-xs text-emerald-700">{success}</div>}
            <section className="rounded-[1.6rem] bg-slate-950 p-4 text-white"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-300"><ShieldCheck className="h-5 w-5" /></span><div><p className="text-xs font-bold">العلاقة نشطة وتحت سيطرتك</p><p className="mt-1 text-[10px] leading-5 text-slate-300">يمكنك تعديل تفضيلات التواصل أو إيقاف الرسائل أو فك الارتباط.</p></div></div></section>
            <section className="rounded-[1.6rem] border border-slate-200 bg-white p-4"><h3 className="text-sm font-bold text-slate-950">تفضيلات التواصل</h3><div className="mt-2">
              <ToggleRow icon={<Bell className="h-4 w-4" />} title="إشعارات داخل سند" description="تنبيهات خدمية مرتبطة بهذا النشاط." checked={detail.relationship.in_app_notifications_enabled} disabled={saving} onChange={(v) => updateLocal('in_app_notifications_enabled', v)} />
              <ToggleRow icon={<MessageCircle className="h-4 w-4" />} title="رسائل واتساب الخدمية" description="مثل تحديثات الطلبات والخدمات التي طلبتها." checked={detail.relationship.whatsapp_service_enabled} disabled={saving} onChange={(v) => updateLocal('whatsapp_service_enabled', v)} />
              <ToggleRow icon={<Bell className="h-4 w-4" />} title="العروض والتسويق عبر واتساب" description="اختياري ويمكنك إيقافه في أي وقت." checked={detail.relationship.whatsapp_marketing_enabled} disabled={saving} onChange={(v) => updateLocal('whatsapp_marketing_enabled', v)} />
            </div><button type="button" onClick={() => void savePreferences()} disabled={saving} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-xs font-bold text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}حفظ التفضيلات</button></section>
            <section className="rounded-[1.6rem] border border-slate-200 bg-white p-4"><h3 className="flex items-center gap-2 text-sm font-bold text-slate-950"><Eye className="h-4 w-4" />ما الذي يراه النشاط؟</h3><ul className="mt-3 space-y-2 text-[11px] leading-6 text-slate-600">{detail.data_scope.visible_to_business.map((item) => <li key={item} className="flex gap-2"><Check className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-600" />{item}</li>)}</ul><details className="mt-4 rounded-2xl bg-slate-50 p-3"><summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-bold text-slate-800"><EyeOff className="h-4 w-4" />بيانات لا يستطيع النشاط رؤيتها<ChevronDown className="mr-auto h-4 w-4" /></summary><ul className="mt-3 space-y-2 text-[11px] leading-6 text-slate-500">{detail.data_scope.not_visible_to_business.map((item) => <li key={item}>• {item}</li>)}</ul></details></section>
            <section className="space-y-2 rounded-[1.6rem] border border-amber-200 bg-amber-50 p-4"><h3 className="flex items-center gap-2 text-sm font-bold text-amber-950"><AlertTriangle className="h-4 w-4" />التحكم في العلاقة</h3><button type="button" onClick={() => void disableCommunications()} disabled={saving} className="min-h-11 w-full rounded-2xl border border-amber-300 bg-white px-4 text-xs font-bold text-amber-900 disabled:opacity-50">إيقاف جميع الرسائل فقط</button><button type="button" onClick={() => setConfirmLeave(true)} disabled={saving} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 text-xs font-bold text-white disabled:opacity-50"><Unlink className="h-4 w-4" />فك الارتباط بالنشاط</button></section>
            {confirmLeave && <section className="rounded-[1.6rem] border border-rose-200 bg-rose-50 p-4"><h3 className="text-sm font-bold text-rose-950">تأكيد فك الارتباط</h3><p className="mt-2 text-[11px] leading-6 text-rose-800">سيختفي ارتباطك النشط، مع الاحتفاظ بالسجلات السابقة اللازمة.</p><select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)} className="mt-3 w-full rounded-xl border border-rose-200 bg-white p-3 text-xs">{REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{reasonCode === 'other' && <textarea value={reasonText} onChange={(e) => setReasonText(e.target.value)} maxLength={500} rows={3} className="mt-2 w-full resize-none rounded-xl border border-rose-200 bg-white p-3 text-xs" placeholder="اكتب السبب باختصار" />}<div className="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => setConfirmLeave(false)} className="min-h-11 rounded-xl border border-slate-200 bg-white text-xs font-bold">تراجع</button><button type="button" onClick={() => void leaveRelationship()} disabled={saving} className="min-h-11 rounded-xl bg-rose-600 text-xs font-bold text-white disabled:opacity-50">تأكيد الفك</button></div></section>}
          </> : null}
        </div>
      </div>
    </div>
  );
}
