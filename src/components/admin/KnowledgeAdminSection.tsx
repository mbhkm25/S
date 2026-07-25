import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive, BookOpen, CheckCircle2, ChevronDown, Database, FileText,
  Globe2, Loader2, Megaphone, Plus, RefreshCw, Save, Search, Send,
  ShieldCheck, Sparkles, X
} from 'lucide-react';
import {
  getKnowledgeOverview,
  setKnowledgeSourceStatus,
  upsertKnowledgeSource,
  type KnowledgeOverview,
  type KnowledgeSourceListItem,
  type KnowledgeSourcePayload,
  type KnowledgeSourceStatus,
  type KnowledgeSourceType
} from '../../lib/knowledgeAdminApi';

interface Props {
  setError: (value: string | null) => void;
  setSuccess: (value: string | null) => void;
}

type EditorMode = 'manual_entry' | 'digital_content' | 'document';

interface EditorState {
  id?: string;
  mode: EditorMode;
  sourceCode: string;
  title: string;
  description: string;
  scope: string;
  visibility: 'assistant_public' | 'assistant_authenticated' | 'internal_only';
  authorityLevel: number;
  heading: string;
  content: string;
  summary: string;
  keywords: string;
  intents: string;
  audiences: string;
  channels: string;
  platform: string;
  contentType: string;
  assistantContext: string;
  campaignName: string;
  campaignObjective: string;
  ctaType: string;
  ctaLabel: string;
  ctaUrl: string;
  whatsappPrefill: string;
  externalUrl: string;
  reason: string;
}

const EMPTY_EDITOR: EditorState = {
  mode: 'manual_entry',
  sourceCode: '',
  title: '',
  description: '',
  scope: 'platform_official',
  visibility: 'assistant_public',
  authorityLevel: 3,
  heading: '',
  content: '',
  summary: '',
  keywords: '',
  intents: '',
  audiences: '',
  channels: 'whatsapp',
  platform: 'facebook',
  contentType: 'post',
  assistantContext: '',
  campaignName: '',
  campaignObjective: '',
  ctaType: 'learn_more',
  ctaLabel: '',
  ctaUrl: '',
  whatsappPrefill: '',
  externalUrl: '',
  reason: ''
};

const SOURCE_LABELS: Record<string, string> = {
  document: 'وثيقة', digital_content: 'محتوى رقمي', faq: 'سؤال شائع',
  official_information: 'معلومة رسمية', service_procedure: 'إجراء خدمة', policy: 'سياسة',
  website_page: 'صفحة موقع', campaign: 'حملة', product_guide: 'دليل منتج',
  dynamic_data: 'بيانات حية', manual_entry: 'مرجع يدوي'
};

const STATUS_LABELS: Record<KnowledgeSourceStatus, string> = {
  draft: 'مسودة', in_review: 'قيد المراجعة', approved: 'معتمد', published: 'منشور',
  superseded: 'مستبدل', archived: 'مؤرشف', expired: 'منتهي'
};

function splitTags(value: string): string[] {
  return value.split(/[,،\n]/).map((item) => item.trim()).filter(Boolean);
}

function statusClass(status: KnowledgeSourceStatus): string {
  if (status === 'published' || status === 'approved') return 'bg-emerald-50 text-emerald-700';
  if (status === 'in_review') return 'bg-amber-50 text-amber-700';
  if (status === 'archived' || status === 'expired' || status === 'superseded') return 'bg-slate-100 text-slate-500';
  return 'bg-sky-50 text-sky-700';
}

function MetricCard({ label, value, icon: Icon }: { label: string; value: number; icon: typeof BookOpen }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <Icon className="h-5 w-5 text-slate-400" />
      <p className="mt-4 text-2xl font-bold text-slate-950">{new Intl.NumberFormat('en-US').format(value)}</p>
      <p className="mt-1 text-[10px] text-slate-500">{label}</p>
    </div>
  );
}

export default function KnowledgeAdminSection({ setError, setSuccess }: Props) {
  const [overview, setOverview] = useState<KnowledgeOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<KnowledgeSourceType | ''>('');
  const [statusFilter, setStatusFilter] = useState<KnowledgeSourceStatus | ''>('');
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusReason, setStatusReason] = useState('');
  const [statusAction, setStatusAction] = useState<{ source: KnowledgeSourceListItem; status: KnowledgeSourceStatus } | null>(null);

  const load = useCallback(async (quiet = false) => {
    quiet ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      setOverview(await getKnowledgeOverview({
        limit: 150,
        search,
        sourceType: typeFilter || null,
        status: statusFilter || null
      }));
    } catch {
      setError('تعذر تحميل مصادر المعرفة. تحقق من الاتصال وصلاحيات الإدارة.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, setError, statusFilter, typeFilter]);

  useEffect(() => { void load(); }, [load]);

  const items = useMemo(() => overview?.items || [], [overview]);

  const startEditor = (mode: EditorMode) => setEditor({ ...EMPTY_EDITOR, mode });

  const buildPayload = (state: EditorState): KnowledgeSourcePayload => {
    const sourceType: KnowledgeSourceType = state.mode === 'digital_content'
      ? 'digital_content'
      : state.mode === 'document' ? 'document' : 'manual_entry';

    const payload: KnowledgeSourcePayload = {
      id: state.id,
      source_code: state.sourceCode || undefined,
      source_type: sourceType,
      title: state.title.trim(),
      description: state.description.trim() || undefined,
      knowledge_scope: state.scope,
      status: 'draft',
      visibility: state.visibility,
      authority_level: state.authorityLevel,
      language: 'ar',
      units: [{
        unit_type: state.mode === 'digital_content' ? 'social_post' : state.mode === 'document' ? 'document_section' : 'section',
        heading: state.heading.trim() || state.title.trim(),
        content: state.content.trim(),
        summary: state.summary.trim() || undefined,
        keywords: splitTags(state.keywords),
        intent_tags: splitTags(state.intents),
        audience_tags: splitTags(state.audiences),
        channel_tags: splitTags(state.channels)
      }],
      references: state.externalUrl.trim() ? [{
        platform: state.mode === 'digital_content' ? state.platform : 'website',
        reference_type: state.mode === 'digital_content' ? 'platform_post' : 'external_url',
        external_url: state.externalUrl.trim(),
        label: 'الرابط المرجعي',
        is_primary: true
      }] : []
    };

    if (state.mode === 'digital_content') {
      payload.digital_content = {
        platform: state.platform,
        content_type: state.contentType,
        body_text: state.content.trim(),
        assistant_context: state.assistantContext.trim() || undefined,
        campaign_name: state.campaignName.trim() || undefined,
        campaign_objective: state.campaignObjective.trim() || undefined,
        primary_cta_type: state.ctaType,
        primary_cta_label: state.ctaLabel.trim() || undefined,
        primary_cta_url: state.ctaUrl.trim() || undefined,
        whatsapp_prefill_text: state.whatsappPrefill.trim() || undefined,
        media: []
      };
    }

    return payload;
  };

  const save = async () => {
    if (!editor || editor.title.trim().length < 2 || !editor.content.trim() || editor.reason.trim().length < 5) return;
    setSaving(true);
    setError(null);
    try {
      const result = await upsertKnowledgeSource(buildPayload(editor), editor.reason.trim());
      setSuccess(`تم حفظ المصدر ${result.source_code} كمسودة وتسجيل الإجراء.`);
      setEditor(null);
      await load(true);
    } catch {
      setError('تعذر حفظ مصدر المعرفة. راجع الحقول والرمز والروابط ثم أعد المحاولة.');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async () => {
    if (!statusAction || statusReason.trim().length < 5) return;
    setSaving(true);
    setError(null);
    try {
      await setKnowledgeSourceStatus(statusAction.source.id, statusAction.status, statusReason.trim());
      setSuccess(`تم تغيير حالة ${statusAction.source.source_code} إلى ${STATUS_LABELS[statusAction.status]}.`);
      setStatusAction(null);
      setStatusReason('');
      await load(true);
    } catch {
      setError('تعذر تغيير حالة المصدر.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex min-h-56 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;

  return (
    <section className="space-y-4">
      <div className="overflow-hidden rounded-[1.8rem] bg-gradient-to-br from-slate-950 to-slate-800 p-5 text-white shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-emerald-300"><Database className="h-4 w-4" /><span className="text-[10px] font-bold">SANAD Knowledge Management</span></div>
            <h2 className="mt-2 text-lg font-bold">إدارة معرفة مساعد سند</h2>
            <p className="mt-1 max-w-xl text-[11px] leading-6 text-slate-300">المصادر الرسمية التي يعتمد عليها المساعد: الوثائق، المحتوى الرقمي، السياسات، الإجراءات والمعلومات المعتمدة.</p>
          </div>
          <button onClick={() => void load(true)} disabled={refreshing} aria-label="تحديث المعرفة" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /></button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MetricCard label="كل المصادر" value={overview?.counts.total || 0} icon={BookOpen} />
        <MetricCard label="منشور للمساعد" value={overview?.counts.published || 0} icon={CheckCircle2} />
        <MetricCard label="المحتوى الرقمي" value={overview?.counts.digital_content || 0} icon={Megaphone} />
        <MetricCard label="الوثائق" value={overview?.counts.documents || 0} icon={FileText} />
      </div>

      {(overview?.counts.needs_review || overview?.counts.expiring_soon) ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-amber-50 p-4"><p className="text-xl font-bold text-amber-800">{overview?.counts.needs_review || 0}</p><p className="mt-1 text-[10px] text-amber-700">تحتاج مراجعة</p></div>
          <div className="rounded-2xl bg-rose-50 p-4"><p className="text-xl font-bold text-rose-800">{overview?.counts.expiring_soon || 0}</p><p className="mt-1 text-[10px] text-rose-700">تنتهي خلال 30 يومًا</p></div>
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        <button onClick={() => startEditor('digital_content')} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-2 text-[10px] font-bold text-white"><Megaphone className="h-4 w-4" />محتوى رقمي</button>
        <button onClick={() => startEditor('document')} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-2 text-[10px] font-bold text-slate-700 shadow-sm"><FileText className="h-4 w-4" />وثيقة مرجعية</button>
        <button onClick={() => startEditor('manual_entry')} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-2 text-[10px] font-bold text-slate-700 shadow-sm"><Plus className="h-4 w-4" />مرجع يدوي</button>
      </div>

      <div className="space-y-3">
        <div className="relative"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث بالعنوان أو كود المصدر..." className="w-full rounded-xl border-0 bg-white py-3 pl-3 pr-10 text-xs outline-none ring-1 ring-slate-100 focus:ring-2 focus:ring-slate-400" /></div>
        <div className="grid grid-cols-2 gap-2">
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as KnowledgeSourceType | '')} className="admin-input"><option value="">كل الأنواع</option>{Object.entries(SOURCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as KnowledgeSourceStatus | '')} className="admin-input"><option value="">كل الحالات</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        </div>
      </div>

      <div className="space-y-2">
        {items.map((source) => (
          <article key={source.id} className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5"><span className="rounded-lg bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-600">{SOURCE_LABELS[source.source_type] || source.source_type}</span><span className={`rounded-lg px-2 py-1 text-[9px] font-bold ${statusClass(source.status)}`}>{STATUS_LABELS[source.status]}</span></div>
                <h3 className="mt-2 text-xs font-bold text-slate-950">{source.title}</h3>
                <p dir="ltr" className="mt-1 text-right font-mono text-[9px] text-slate-400">{source.source_code}</p>
              </div>
              <div className="text-left"><p className="text-[9px] text-slate-400">سلطة {source.authority_level}</p><p className="mt-1 text-[9px] text-slate-400">{source.units_count} وحدة</p></div>
            </div>
            {source.description && <p className="mt-3 line-clamp-2 text-[10px] leading-5 text-slate-500">{source.description}</p>}
            <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
              {source.status === 'draft' && <button onClick={() => setStatusAction({ source, status: 'in_review' })} className="min-h-9 rounded-xl bg-amber-50 px-3 text-[9px] font-bold text-amber-700">إرسال للمراجعة</button>}
              {source.status === 'in_review' && <button onClick={() => setStatusAction({ source, status: 'approved' })} className="min-h-9 rounded-xl bg-sky-50 px-3 text-[9px] font-bold text-sky-700">اعتماد</button>}
              {source.status === 'approved' && <button onClick={() => setStatusAction({ source, status: 'published' })} className="min-h-9 rounded-xl bg-emerald-50 px-3 text-[9px] font-bold text-emerald-700">نشر للمساعد</button>}
              {!['archived', 'expired'].includes(source.status) && <button onClick={() => setStatusAction({ source, status: 'archived' })} className="min-h-9 rounded-xl bg-slate-100 px-3 text-[9px] font-bold text-slate-600"><Archive className="ml-1 inline h-3 w-3" />أرشفة</button>}
            </div>
          </article>
        ))}
        {!items.length && <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center"><Sparkles className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-3 text-xs font-bold text-slate-700">لا توجد مصادر معرفة مطابقة</p><p className="mt-1 text-[10px] text-slate-400">ابدأ بإضافة أول وثيقة أو محتوى رقمي رسمي.</p></div>}
      </div>

      {editor && (
        <div className="fixed inset-0 z-[90] overflow-y-auto bg-slate-950/55 p-3 sm:p-6">
          <div className="mx-auto w-full max-w-2xl rounded-[1.8rem] bg-[#f7f8fa] p-4 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-3"><div><h3 className="text-base font-bold">{editor.mode === 'digital_content' ? 'إضافة محتوى رقمي' : editor.mode === 'document' ? 'إضافة وثيقة مرجعية' : 'إضافة مرجع يدوي'}</h3><p className="mt-1 text-[10px] leading-5 text-slate-500">سيُحفظ المصدر كمسودة، ولن يستخدمه المساعد قبل الاعتماد والنشر.</p></div><button onClick={() => setEditor(null)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-white"><X className="h-4 w-4" /></button></div>

            <div className="mt-5 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2"><Field label="عنوان المصدر"><input value={editor.title} onChange={(e) => setEditor({ ...editor, title: e.target.value })} className="admin-input" placeholder="مثال: تثبيت تطبيق سند من فيسبوك" /></Field><Field label="كود المصدر"><input dir="ltr" value={editor.sourceCode} onChange={(e) => setEditor({ ...editor, sourceCode: e.target.value.toUpperCase() })} className="admin-input text-left font-mono" placeholder="FB-INSTALL-001" /></Field></div>
              <Field label="وصف داخلي"><textarea value={editor.description} onChange={(e) => setEditor({ ...editor, description: e.target.value })} className="admin-input min-h-20 resize-none" /></Field>
              <div className="grid gap-3 sm:grid-cols-3"><Field label="نطاق المعرفة"><select value={editor.scope} onChange={(e) => setEditor({ ...editor, scope: e.target.value })} className="admin-input"><option value="platform_official">معلومات المنصة</option><option value="customer_service">خدمة العملاء</option><option value="digital_marketing">التسويق الرقمي</option><option value="technical_support">الدعم الفني</option><option value="financial_operations">العمليات المالية</option><option value="subscription">الاشتراكات</option><option value="business">سند التجاري</option><option value="internal_operations">تشغيل داخلي</option></select></Field><Field label="مستوى السلطة"><select value={editor.authorityLevel} onChange={(e) => setEditor({ ...editor, authorityLevel: Number(e.target.value) })} className="admin-input"><option value={1}>1 — ملزم</option><option value={2}>2 — رسمي معتمد</option><option value={3}>3 — معلومات رسمية</option><option value={4}>4 — تسويقي</option><option value={5}>5 — مساعد</option></select></Field><Field label="إتاحة المصدر"><select value={editor.visibility} onChange={(e) => setEditor({ ...editor, visibility: e.target.value as EditorState['visibility'] })} className="admin-input"><option value="assistant_public">عام للمساعد</option><option value="assistant_authenticated">للمستخدم المسجل</option><option value="internal_only">داخلي فقط</option></select></Field></div>

              {editor.mode === 'digital_content' && <div className="rounded-2xl bg-white p-4 shadow-sm"><div className="flex items-center gap-2"><Megaphone className="h-4 w-4 text-slate-400" /><h4 className="text-xs font-bold">بيانات النشر والحملة</h4></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="المنصة"><select value={editor.platform} onChange={(e) => setEditor({ ...editor, platform: e.target.value })} className="admin-input"><option value="facebook">Facebook</option><option value="instagram">Instagram</option><option value="whatsapp">WhatsApp</option><option value="youtube">YouTube</option><option value="tiktok">TikTok</option><option value="website">الموقع</option><option value="other">أخرى</option></select></Field><Field label="نوع المحتوى"><select value={editor.contentType} onChange={(e) => setEditor({ ...editor, contentType: e.target.value })} className="admin-input"><option value="post">منشور</option><option value="reel">Reel</option><option value="story">Story</option><option value="video">فيديو</option><option value="image">صورة</option><option value="article">مقال</option><option value="campaign">حملة</option><option value="announcement">إعلان</option></select></Field><Field label="اسم الحملة"><input value={editor.campaignName} onChange={(e) => setEditor({ ...editor, campaignName: e.target.value })} className="admin-input" /></Field><Field label="هدف الحملة"><input value={editor.campaignObjective} onChange={(e) => setEditor({ ...editor, campaignObjective: e.target.value })} className="admin-input" /></Field></div></div>}

              <Field label={editor.mode === 'digital_content' ? 'نص المنشور الكامل' : 'محتوى المعرفة'}><textarea value={editor.content} onChange={(e) => setEditor({ ...editor, content: e.target.value })} className="admin-input min-h-40 resize-y" placeholder="اكتب النص الرسمي الذي سيعتمد عليه المساعد..." /></Field>
              <div className="grid gap-3 sm:grid-cols-2"><Field label="عنوان الوحدة"><input value={editor.heading} onChange={(e) => setEditor({ ...editor, heading: e.target.value })} className="admin-input" /></Field><Field label="الملخص"><input value={editor.summary} onChange={(e) => setEditor({ ...editor, summary: e.target.value })} className="admin-input" /></Field></div>
              <div className="grid gap-3 sm:grid-cols-2"><Field label="الكلمات المفتاحية"><input value={editor.keywords} onChange={(e) => setEditor({ ...editor, keywords: e.target.value })} className="admin-input" placeholder="تثبيت، تطبيق، فيسبوك" /></Field><Field label="نوايا المستخدم"><input dir="ltr" value={editor.intents} onChange={(e) => setEditor({ ...editor, intents: e.target.value })} className="admin-input text-left" placeholder="install_app, digital_content" /></Field><Field label="الجمهور"><input dir="ltr" value={editor.audiences} onChange={(e) => setEditor({ ...editor, audiences: e.target.value })} className="admin-input text-left" placeholder="new_user, customer" /></Field><Field label="القنوات"><input dir="ltr" value={editor.channels} onChange={(e) => setEditor({ ...editor, channels: e.target.value })} className="admin-input text-left" placeholder="whatsapp, app" /></Field></div>

              {editor.mode === 'digital_content' && <div className="rounded-2xl bg-white p-4 shadow-sm"><div className="flex items-center gap-2"><Send className="h-4 w-4 text-slate-400" /><h4 className="text-xs font-bold">تعليمات المساعد والدعوة للإجراء</h4></div><div className="mt-4 space-y-3"><Field label="سياق المساعد"><textarea value={editor.assistantContext} onChange={(e) => setEditor({ ...editor, assistantContext: e.target.value })} className="admin-input min-h-24 resize-none" placeholder="اشرح للمساعد ما الذي يعنيه المنشور وكيف يجيب عنه..." /></Field><div className="grid gap-3 sm:grid-cols-2"><Field label="نوع CTA"><select value={editor.ctaType} onChange={(e) => setEditor({ ...editor, ctaType: e.target.value })} className="admin-input"><option value="install_app">تثبيت التطبيق</option><option value="open_whatsapp">فتح واتساب</option><option value="subscribe">الاشتراك</option><option value="visit_url">زيارة رابط</option><option value="contact_support">الدعم</option><option value="learn_more">معرفة المزيد</option><option value="none">بدون</option></select></Field><Field label="نص CTA"><input value={editor.ctaLabel} onChange={(e) => setEditor({ ...editor, ctaLabel: e.target.value })} className="admin-input" /></Field></div><Field label="رابط CTA"><input dir="ltr" value={editor.ctaUrl} onChange={(e) => setEditor({ ...editor, ctaUrl: e.target.value })} className="admin-input text-left" placeholder="https://app.sanadflow.com/install/" /></Field><Field label="رسالة واتساب الجاهزة"><textarea value={editor.whatsappPrefill} onChange={(e) => setEditor({ ...editor, whatsappPrefill: e.target.value })} className="admin-input min-h-20 resize-none" /></Field></div></div>}

              <Field label="الرابط الخارجي أو رابط المنشور"><input dir="ltr" value={editor.externalUrl} onChange={(e) => setEditor({ ...editor, externalUrl: e.target.value })} className="admin-input text-left" placeholder="https://facebook.com/..." /></Field>
              <Field label="سبب الإنشاء أو التعديل"><textarea value={editor.reason} onChange={(e) => setEditor({ ...editor, reason: e.target.value })} className="admin-input min-h-20 resize-none" placeholder="سبب واضح لا يقل عن 5 أحرف" /></Field>
              <button onClick={() => void save()} disabled={saving || editor.title.trim().length < 2 || !editor.content.trim() || editor.reason.trim().length < 5} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 text-xs font-bold text-white disabled:opacity-40">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}حفظ كمسودة</button>
            </div>
          </div>
        </div>
      )}

      {statusAction && (
        <div className="fixed inset-0 z-[95] flex items-end justify-center bg-slate-950/55 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-[1.8rem] bg-white p-5 shadow-2xl">
            <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-slate-400" /><h3 className="text-base font-bold">{STATUS_LABELS[statusAction.status]}</h3></div>
            <p className="mt-2 text-xs leading-6 text-slate-500">{statusAction.source.title} — {statusAction.source.source_code}</p>
            <Field label="سبب الإجراء"><textarea value={statusReason} onChange={(e) => setStatusReason(e.target.value)} className="admin-input mt-2 min-h-24 resize-none" placeholder="اكتب سببًا واضحًا" /></Field>
            <div className="mt-4 grid grid-cols-2 gap-2"><button onClick={() => void changeStatus()} disabled={saving || statusReason.trim().length < 5} className="min-h-11 rounded-xl bg-slate-950 text-xs font-bold text-white disabled:opacity-40">{saving ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'تأكيد'}</button><button onClick={() => { setStatusAction(null); setStatusReason(''); }} disabled={saving} className="min-h-11 rounded-xl bg-slate-100 text-xs font-bold">إلغاء</button></div>
          </div>
        </div>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-[11px] font-bold text-slate-700">{label}<div className="mt-2">{children}</div></label>;
}
