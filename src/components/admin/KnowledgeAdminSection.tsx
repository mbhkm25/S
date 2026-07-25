import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive, BookOpen, CheckCircle2, FileText, FlaskConical, FolderOpen,
  Loader2, Megaphone, Plus, RefreshCw, Search, Send, UploadCloud
} from 'lucide-react';
import KnowledgeTestCenter from './KnowledgeTestCenter';
import {
  createSimpleDigitalContent,
  getKnowledgeFiles,
  getKnowledgeOverview,
  setKnowledgeSourceStatus,
  uploadKnowledgeFile,
  type KnowledgeFileItem,
  type KnowledgeOverview,
  type KnowledgeSourceListItem,
  type KnowledgeSourceStatus,
  type KnowledgeSourceType
} from '../../lib/knowledgeAdminApi';

interface Props {
  setError: (value: string | null) => void;
  setSuccess: (value: string | null) => void;
}

type WorkspaceTab = 'sources' | 'add' | 'files' | 'test';
type AddMode = 'digital' | 'file';

const SOURCE_LABELS: Record<string, string> = {
  document: 'وثيقة', digital_content: 'محتوى رقمي', faq: 'سؤال شائع',
  official_information: 'معلومة رسمية', service_procedure: 'إجراء خدمة', policy: 'سياسة',
  website_page: 'صفحة موقع', campaign: 'حملة', product_guide: 'دليل منتج',
  dynamic_data: 'بيانات حية', manual_entry: 'مرجع نصي'
};

const STATUS_LABELS: Record<KnowledgeSourceStatus, string> = {
  draft: 'مسودة', in_review: 'قيد المراجعة', approved: 'معتمد', published: 'منشور',
  superseded: 'مستبدل', archived: 'مؤرشف', expired: 'منتهي'
};

const FILE_STATUS_LABELS: Record<KnowledgeFileItem['processing_status'], string> = {
  uploaded: 'تم الرفع', processing: 'قيد استخراج النص', ready_for_review: 'جاهز للمراجعة',
  failed: 'تعذر الاستخراج', approved: 'معتمد', published: 'منشور'
};

function statusClass(status: KnowledgeSourceStatus): string {
  if (status === 'published' || status === 'approved') return 'bg-emerald-50 text-emerald-700';
  if (status === 'in_review') return 'bg-amber-50 text-amber-700';
  if (status === 'archived' || status === 'expired' || status === 'superseded') return 'bg-slate-100 text-slate-500';
  return 'bg-sky-50 text-sky-700';
}

function fileStatusClass(status: KnowledgeFileItem['processing_status']): string {
  if (status === 'ready_for_review' || status === 'approved' || status === 'published') return 'bg-emerald-50 text-emerald-700';
  if (status === 'processing' || status === 'uploaded') return 'bg-amber-50 text-amber-700';
  if (status === 'failed') return 'bg-rose-50 text-rose-700';
  return 'bg-slate-100 text-slate-600';
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export default function KnowledgeAdminSection({ setError, setSuccess }: Props) {
  const [tab, setTab] = useState<WorkspaceTab>('sources');
  const [addMode, setAddMode] = useState<AddMode>('digital');
  const [overview, setOverview] = useState<KnowledgeOverview | null>(null);
  const [files, setFiles] = useState<KnowledgeFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<KnowledgeSourceType | ''>('');
  const [statusFilter, setStatusFilter] = useState<KnowledgeSourceStatus | ''>('');
  const [statusAction, setStatusAction] = useState<{ source: KnowledgeSourceListItem; status: KnowledgeSourceStatus } | null>(null);
  const [statusReason, setStatusReason] = useState('');
  const [platform, setPlatform] = useState('facebook');
  const [postUrl, setPostUrl] = useState('');
  const [postText, setPostText] = useState('');
  const [postTitle, setPostTitle] = useState('');
  const [fileTitle, setFileTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const load = useCallback(async (quiet = false) => {
    quiet ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const [nextOverview, nextFiles] = await Promise.all([
        getKnowledgeOverview({
          limit: 150,
          search,
          sourceType: typeFilter || null,
          status: statusFilter || null
        }),
        getKnowledgeFiles(100)
      ]);
      setOverview(nextOverview);
      setFiles(nextFiles);
    } catch {
      setError('تعذر تحميل إدارة المعرفة. تحقق من الاتصال وصلاحيات مدير المنصة.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, setError, statusFilter, typeFilter]);

  useEffect(() => { void load(); }, [load]);

  const items = useMemo(() => overview?.items || [], [overview]);

  const saveDigitalContent = async () => {
    if (!postText.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const result = await createSimpleDigitalContent({
        platform,
        postUrl,
        postText,
        title: postTitle
      });
      setSuccess(`تم حفظ المحتوى ${result.source_code} كمسودة.`);
      setPostUrl('');
      setPostText('');
      setPostTitle('');
      setTab('sources');
      await load(true);
    } catch {
      setError('تعذر حفظ المحتوى الرقمي. راجع النص والرابط ثم أعد المحاولة.');
    } finally {
      setSaving(false);
    }
  };

  const uploadFile = async () => {
    if (!selectedFile) return;
    setSaving(true);
    setError(null);
    try {
      const result = await uploadKnowledgeFile(selectedFile, fileTitle);
      setSuccess(`تم رفع الملف وإنشاء المصدر ${result.source_code}. بدأ استخراج النص تلقائيًا.`);
      setSelectedFile(null);
      setFileTitle('');
      setTab('files');
      await load(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر رفع ملف المعرفة.');
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

  const tabs: Array<{ id: WorkspaceTab; label: string; icon: typeof BookOpen }> = [
    { id: 'sources', label: 'المصادر', icon: BookOpen },
    { id: 'add', label: 'إضافة معرفة', icon: Plus },
    { id: 'files', label: 'الملفات', icon: FolderOpen },
    { id: 'test', label: 'الاختبار', icon: FlaskConical }
  ];

  return (
    <section className="space-y-4">
      <div className="rounded-[1.8rem] bg-slate-950 p-5 text-white shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-emerald-300"><BookOpen className="h-4 w-4" /><span className="text-[10px] font-bold">إدارة المعرفة</span></div>
            <h2 className="mt-2 text-lg font-bold">مصادر مساعد سند الرسمية</h2>
            <p className="mt-1 max-w-xl text-[11px] leading-6 text-slate-300">أضف منشورًا أو ارفع ملفًا، ثم راجع المعرفة واعتمدها قبل نشرها للمساعد.</p>
          </div>
          <button onClick={() => void load(true)} disabled={refreshing} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 disabled:opacity-50" aria-label="تحديث"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /></button>
        </div>
      </div>

      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)} className={`flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-[11px] font-bold ${tab === id ? 'bg-slate-950 text-white' : 'bg-white text-slate-500 shadow-sm'}`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {tab === 'sources' && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-2">
            <Metric value={overview?.counts.total || 0} label="المصادر" />
            <Metric value={overview?.counts.published || 0} label="منشور" />
            <Metric value={overview?.counts.digital_content || 0} label="رقمي" />
            <Metric value={overview?.counts.documents || 0} label="ملفات" />
          </div>

          <button onClick={() => setTab('add')} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-xs font-bold text-white"><Plus className="h-4 w-4" />إضافة معرفة جديدة</button>

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
                  <div className="text-left text-[9px] text-slate-400"><p>{source.units_count} وحدة</p><p className="mt-1">سلطة {source.authority_level}</p></div>
                </div>
                {source.description && <p className="mt-3 line-clamp-2 text-[10px] leading-5 text-slate-500">{source.description}</p>}
                <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  {source.status === 'draft' && <button onClick={() => setStatusAction({ source, status: 'in_review' })} className="min-h-9 rounded-xl bg-amber-50 px-3 text-[9px] font-bold text-amber-700"><Send className="ml-1 inline h-3 w-3" />إرسال للمراجعة</button>}
                  {source.status === 'in_review' && <button onClick={() => setStatusAction({ source, status: 'approved' })} className="min-h-9 rounded-xl bg-sky-50 px-3 text-[9px] font-bold text-sky-700">اعتماد</button>}
                  {source.status === 'approved' && <button onClick={() => setStatusAction({ source, status: 'published' })} className="min-h-9 rounded-xl bg-emerald-50 px-3 text-[9px] font-bold text-emerald-700"><CheckCircle2 className="ml-1 inline h-3 w-3" />نشر للمساعد</button>}
                  {!['archived', 'expired'].includes(source.status) && <button onClick={() => setStatusAction({ source, status: 'archived' })} className="min-h-9 rounded-xl bg-slate-100 px-3 text-[9px] font-bold text-slate-600"><Archive className="ml-1 inline h-3 w-3" />أرشفة</button>}
                </div>
              </article>
            ))}
            {!items.length && <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center"><BookOpen className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-3 text-xs font-bold text-slate-700">لا توجد مصادر مطابقة</p></div>}
          </div>
        </div>
      )}

      {tab === 'add' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setAddMode('digital')} className={`min-h-12 rounded-xl text-xs font-bold ${addMode === 'digital' ? 'bg-slate-950 text-white' : 'bg-white text-slate-600 shadow-sm'}`}><Megaphone className="ml-2 inline h-4 w-4" />محتوى منشور</button>
            <button onClick={() => setAddMode('file')} className={`min-h-12 rounded-xl text-xs font-bold ${addMode === 'file' ? 'bg-slate-950 text-white' : 'bg-white text-slate-600 shadow-sm'}`}><UploadCloud className="ml-2 inline h-4 w-4" />ملف أو صورة</button>
          </div>

          {addMode === 'digital' ? (
            <div className="space-y-4 rounded-2xl bg-white p-4 shadow-sm">
              <div><h3 className="text-sm font-bold">إضافة محتوى منشور</h3><p className="mt-1 text-[10px] leading-5 text-slate-500">المنصة والرابط والنص تكفي. ينشئ النظام بقية البيانات تلقائيًا.</p></div>
              <label className="block text-[11px] font-bold text-slate-700">المنصة<select value={platform} onChange={(e) => setPlatform(e.target.value)} className="admin-input mt-2"><option value="facebook">Facebook</option><option value="instagram">Instagram</option><option value="whatsapp">WhatsApp</option><option value="youtube">YouTube</option><option value="tiktok">TikTok</option><option value="website">الموقع</option><option value="other">أخرى</option></select></label>
              <label className="block text-[11px] font-bold text-slate-700">رابط المنشور<input dir="ltr" value={postUrl} onChange={(e) => setPostUrl(e.target.value)} className="admin-input mt-2 text-left" placeholder="https://facebook.com/..." /></label>
              <label className="block text-[11px] font-bold text-slate-700">نص المنشور <span className="text-rose-500">*</span><textarea value={postText} onChange={(e) => setPostText(e.target.value)} className="admin-input mt-2 min-h-40 resize-y" placeholder="الصق نص المنشور كاملًا هنا..." /></label>
              <details className="rounded-xl bg-slate-50 p-3"><summary className="cursor-pointer text-[11px] font-bold text-slate-700">عنوان مخصص اختياري</summary><input value={postTitle} onChange={(e) => setPostTitle(e.target.value)} className="admin-input mt-3" placeholder="يُنشأ تلقائيًا من بداية النص" /></details>
              <button onClick={() => void saveDigitalContent()} disabled={saving || !postText.trim()} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-xs font-bold text-white disabled:opacity-40">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}حفظ المحتوى</button>
            </div>
          ) : (
            <div className="space-y-4 rounded-2xl bg-white p-4 shadow-sm">
              <div><h3 className="text-sm font-bold">رفع ملف أو صورة</h3><p className="mt-1 text-[10px] leading-5 text-slate-500">يدعم PDF وDOC/DOCX وXLS/XLSX وPPT/PPTX وMarkdown وTXT وCSV وJSON والصور. الحد الأقصى 25 MB.</p></div>
              <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
                <UploadCloud className="h-8 w-8 text-slate-400" />
                <span className="mt-3 text-xs font-bold text-slate-700">{selectedFile ? selectedFile.name : 'اختر ملفًا من الجوال أو الكمبيوتر'}</span>
                {selectedFile && <span className="mt-1 text-[10px] text-slate-400">{formatBytes(selectedFile.size)}</span>}
                <input type="file" className="sr-only" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.md,.markdown,.txt,.csv,.html,.json,.png,.jpg,.jpeg,.webp" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
              </label>
              <label className="block text-[11px] font-bold text-slate-700">عنوان اختياري<input value={fileTitle} onChange={(e) => setFileTitle(e.target.value)} className="admin-input mt-2" placeholder="يُستخدم اسم الملف تلقائيًا" /></label>
              <button onClick={() => void uploadFile()} disabled={saving || !selectedFile} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 text-xs font-bold text-white disabled:opacity-40">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}رفع وبدء الاستخراج</button>
            </div>
          )}
        </div>
      )}

      {tab === 'files' && (
        <div className="space-y-3">
          <div className="rounded-2xl bg-white p-4 shadow-sm"><h3 className="text-sm font-bold">ملفات المعرفة</h3><p className="mt-1 text-[10px] leading-5 text-slate-500">لا يستخدم المساعد أي ملف قبل اكتمال الاستخراج والمراجعة والنشر.</p></div>
          {files.map((file) => (
            <article key={file.id} className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100"><FileText className="h-5 w-5 text-slate-500" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="truncate text-xs font-bold text-slate-900">{file.title}</h3><span className={`rounded-lg px-2 py-1 text-[9px] font-bold ${fileStatusClass(file.processing_status)}`}>{FILE_STATUS_LABELS[file.processing_status]}</span></div><p className="mt-1 truncate text-[10px] text-slate-500">{file.original_name} • {formatBytes(file.size_bytes)}</p><p dir="ltr" className="mt-1 text-right font-mono text-[9px] text-slate-400">{file.source_code}</p></div></div>
              {file.extraction_summary && <p className="mt-3 text-[10px] leading-5 text-slate-500">{file.extraction_summary}</p>}
              {file.processing_error && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-[10px] text-rose-700">{file.processing_error}</p>}
            </article>
          ))}
          {!files.length && <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center"><FolderOpen className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-3 text-xs font-bold text-slate-700">لم تُرفع ملفات بعد</p></div>}
        </div>
      )}

      {tab === 'test' && <KnowledgeTestCenter setError={setError} />}

      {statusAction && (
        <div className="fixed inset-0 z-[95] flex items-end justify-center bg-slate-950/55 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-[1.8rem] bg-white p-5 shadow-2xl">
            <h3 className="text-base font-bold">{STATUS_LABELS[statusAction.status]}</h3>
            <p className="mt-2 text-xs leading-6 text-slate-500">{statusAction.source.title} — {statusAction.source.source_code}</p>
            <label className="mt-4 block text-[11px] font-bold text-slate-700">سبب الإجراء<textarea value={statusReason} onChange={(e) => setStatusReason(e.target.value)} className="admin-input mt-2 min-h-24 resize-none" placeholder="اكتب سببًا واضحًا" /></label>
            <div className="mt-4 grid grid-cols-2 gap-2"><button onClick={() => void changeStatus()} disabled={saving || statusReason.trim().length < 5} className="min-h-11 rounded-xl bg-slate-950 text-xs font-bold text-white disabled:opacity-40">{saving ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'تأكيد'}</button><button onClick={() => { setStatusAction(null); setStatusReason(''); }} disabled={saving} className="min-h-11 rounded-xl bg-slate-100 text-xs font-bold">إلغاء</button></div>
          </div>
        </div>
      )}
    </section>
  );
}

function Metric({ value, label }: { value: number; label: string }) {
  return <div className="rounded-2xl bg-white p-3 text-center shadow-sm"><p className="text-xl font-bold text-slate-950">{new Intl.NumberFormat('en-US').format(value)}</p><p className="mt-1 text-[9px] text-slate-500">{label}</p></div>;
}
