import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  EyeOff,
  Loader2,
  Package,
  Pencil,
  Plus,
  Save,
  Star
} from 'lucide-react';
import { getUserBusinessContexts, updateBusinessProfile, type BusinessProfile } from '../../lib/businessApi';
import {
  getBusinessCatalog,
  upsertBusinessCatalogItem,
  type BusinessCatalogAvailability,
  type BusinessCatalogItem,
  type BusinessCatalogItemStatus,
  type BusinessCatalogItemType
} from '../../lib/businessCatalogApi';
import { getActiveManagedBusinessId, rememberActiveManagedBusiness } from '../../lib/businessManagementApi';
import { toLatinDigits } from '../../lib/digits';

interface BusinessWhatsAppCatalogProps {
  onNavigate: (page: string) => void;
  businessId?: string;
}

type EditorState = {
  itemId: string | null;
  title: string;
  description: string;
  itemType: BusinessCatalogItemType;
  price: string;
  currency: '' | 'YER' | 'SAR' | 'USD';
  status: BusinessCatalogItemStatus;
  isFeatured: boolean;
  availabilityStatus: BusinessCatalogAvailability;
  displayOrder: string;
};

const EMPTY_EDITOR: EditorState = {
  itemId: null,
  title: '',
  description: '',
  itemType: 'product',
  price: '',
  currency: '',
  status: 'active',
  isFeatured: false,
  availabilityStatus: 'available',
  displayOrder: '100'
};

const TYPE_LABELS: Record<BusinessCatalogItemType, string> = {
  product: 'منتج',
  service: 'خدمة',
  digital: 'رقمي',
  offer: 'عرض',
  subscription: 'اشتراك',
  other: 'عنصر آخر'
};

function statusLabel(item: BusinessCatalogItem) {
  if (item.status === 'hidden') return 'مخفي';
  if (item.status === 'draft') return 'مسودة';
  if (item.status === 'archived') return 'مؤرشف';
  return 'منشور';
}

function priceLabel(item: BusinessCatalogItem) {
  if (item.price === null || item.price === undefined) return 'السعر عند الطلب';
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(item.price)}${item.currency ? ` ${item.currency}` : ''}`;
}

export default function BusinessWhatsAppCatalog({ businessId: providedBusinessId }: BusinessWhatsAppCatalogProps) {
  const [loading, setLoading] = useState(true);
  const [savingItem, setSavingItem] = useState(false);
  const [savingExternal, setSavingExternal] = useState(false);
  const [business, setBusiness] = useState<BusinessProfile | null>(null);
  const [items, setItems] = useState<BusinessCatalogItem[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [externalOpen, setExternalOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState>(EMPTY_EDITOR);
  const [catalogUrl, setCatalogUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const activeCount = useMemo(() => items.filter((item) => item.status === 'active').length, [items]);
  const featuredCount = useMemo(() => items.filter((item) => item.status === 'active' && item.is_featured).length, [items]);

  const resolveBusiness = async () => {
    const contexts = await getUserBusinessContexts();
    const preferredId = providedBusinessId || getActiveManagedBusinessId();
    const current = preferredId
      ? contexts.owned_businesses.find((item) => item.id === preferredId) || null
      : contexts.owned_businesses?.[0] || null;
    if (!current) throw new Error('فقط مالك النشاط يمكنه إدارة الكتالوج.');
    rememberActiveManagedBusiness(current.id);
    return current;
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const current = await resolveBusiness();
      setBusiness(current);
      setCatalogUrl(current.whatsapp_catalog_url || '');
      setItems(await getBusinessCatalog(current.id, true));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحميل الكتالوج.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [providedBusinessId]);

  const openNewEditor = () => {
    setEditor(EMPTY_EDITOR);
    setEditorOpen(true);
    setSuccess(null);
    setError(null);
  };

  const openEditEditor = (item: BusinessCatalogItem) => {
    setEditor({
      itemId: item.id,
      title: item.title,
      description: item.description || '',
      itemType: item.item_type,
      price: item.price === null || item.price === undefined ? '' : String(item.price),
      currency: item.currency || '',
      status: item.status,
      isFeatured: item.is_featured,
      availabilityStatus: item.availability_status,
      displayOrder: String(item.display_order ?? 100)
    });
    setEditorOpen(true);
    setSuccess(null);
    setError(null);
  };

  const saveItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!business || !editor.title.trim()) return;
    setSavingItem(true);
    setError(null);
    setSuccess(null);
    try {
      await upsertBusinessCatalogItem({
        businessId: business.id,
        itemId: editor.itemId,
        itemType: editor.itemType,
        title: editor.title,
        description: editor.description || null,
        price: editor.price ? Number(toLatinDigits(editor.price)) : null,
        currency: editor.currency || null,
        status: editor.status,
        displayOrder: Number(toLatinDigits(editor.displayOrder || '100')) || 100,
        isFeatured: editor.isFeatured,
        availabilityStatus: editor.availabilityStatus,
        contactAction: 'whatsapp'
      });
      setEditor(EMPTY_EDITOR);
      setEditorOpen(false);
      setItems(await getBusinessCatalog(business.id, true));
      setSuccess(editor.itemId ? 'تم تحديث العنصر.' : 'تمت إضافة العنصر.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر حفظ العنصر.');
    } finally {
      setSavingItem(false);
    }
  };

  const toggleItem = async (item: BusinessCatalogItem) => {
    if (!business) return;
    setError(null);
    setSuccess(null);
    try {
      await upsertBusinessCatalogItem({
        businessId: business.id,
        itemId: item.id,
        itemType: item.item_type,
        title: item.title,
        description: item.description,
        price: item.price,
        currency: item.currency,
        imagePaths: item.image_paths,
        status: item.status === 'active' ? 'hidden' : 'active',
        displayOrder: item.display_order,
        isFeatured: item.is_featured,
        availabilityStatus: item.availability_status,
        contactAction: item.contact_action
      });
      setItems(await getBusinessCatalog(business.id, true));
      setSuccess(item.status === 'active' ? 'تم إخفاء العنصر.' : 'تم نشر العنصر.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحديث حالة العنصر.');
    }
  };

  const isValidCatalogUrl = (value: string) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
      return false;
    }
  };

  const saveExternal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!business) return;
    const cleanUrl = catalogUrl.trim();
    if (!isValidCatalogUrl(cleanUrl)) {
      setError('أدخل رابطًا صحيحًا يبدأ بـ https:// أو اتركه فارغًا.');
      return;
    }
    setSavingExternal(true);
    setError(null);
    try {
      await updateBusinessProfile({
        p_business_id: business.id,
        p_whatsapp_catalog_url: cleanUrl || null
      });
      setSuccess(cleanUrl ? 'تم حفظ رابط كتالوج واتساب.' : 'تمت إزالة رابط كتالوج واتساب.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر حفظ رابط كتالوج واتساب.');
    } finally {
      setSavingExternal(false);
    }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-4 font-arabic text-right" dir="rtl">
      <header className="flex items-start justify-between gap-3 px-1">
        <div className="min-w-0"><h2 className="text-lg font-bold text-slate-950">كتالوج النشاط</h2><p className="mt-1 text-[11px] text-slate-500">العناصر التي تظهر في الملف العام للنشاط الحالي.</p></div>
        <button type="button" onClick={openNewEditor} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2.5 text-[10px] font-bold text-white"><Plus className="h-4 w-4" />عنصر جديد</button>
      </header>

      {error && <div className="flex gap-2 rounded-2xl border border-rose-100 bg-rose-50 p-3 text-xs text-rose-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
      {success && <div className="flex gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-700"><CheckCircle2 className="h-4 w-4 shrink-0" />{success}</div>}

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-white p-3 text-center"><strong className="block text-lg">{items.length}</strong><span className="text-[9px] text-slate-400">كل العناصر</span></div>
        <div className="rounded-2xl bg-white p-3 text-center"><strong className="block text-lg">{activeCount}</strong><span className="text-[9px] text-slate-400">المنشورة</span></div>
        <div className="rounded-2xl bg-white p-3 text-center"><strong className="block text-lg">{featuredCount}</strong><span className="text-[9px] text-slate-400">المميزة</span></div>
      </div>

      {editorOpen && (
        <form onSubmit={saveItem} className="grid gap-3 border-y border-slate-200 bg-white px-3 py-4 sm:grid-cols-2 sm:rounded-2xl sm:border">
          <input value={editor.title} onChange={(event) => setEditor((state) => ({ ...state, title: event.target.value }))} placeholder="اسم العنصر" maxLength={120} required className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs sm:col-span-2" />
          <textarea value={editor.description} onChange={(event) => setEditor((state) => ({ ...state, description: event.target.value }))} placeholder="وصف مختصر" rows={3} maxLength={500} className="resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs sm:col-span-2" />
          <select value={editor.itemType} onChange={(event) => setEditor((state) => ({ ...state, itemType: event.target.value as BusinessCatalogItemType }))} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">{Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <select value={editor.availabilityStatus} onChange={(event) => setEditor((state) => ({ ...state, availabilityStatus: event.target.value as BusinessCatalogAvailability }))} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"><option value="available">متاح</option><option value="on_request">عند الطلب</option><option value="unavailable">غير متاح</option></select>
          <input value={editor.price} onChange={(event) => setEditor((state) => ({ ...state, price: toLatinDigits(event.target.value).replace(/[^0-9.]/g, '') }))} placeholder="السعر" inputMode="decimal" className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-left font-mono text-xs" dir="ltr" />
          <select value={editor.currency} onChange={(event) => setEditor((state) => ({ ...state, currency: event.target.value as EditorState['currency'] }))} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"><option value="">بدون عملة</option><option value="YER">YER</option><option value="SAR">SAR</option><option value="USD">USD</option></select>
          <select value={editor.status} onChange={(event) => setEditor((state) => ({ ...state, status: event.target.value as BusinessCatalogItemStatus }))} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"><option value="active">منشور</option><option value="draft">مسودة</option><option value="hidden">مخفي</option></select>
          <input value={editor.displayOrder} onChange={(event) => setEditor((state) => ({ ...state, displayOrder: toLatinDigits(event.target.value).replace(/\D/g, '') }))} placeholder="ترتيب العرض" inputMode="numeric" className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-left font-mono text-xs" dir="ltr" />
          <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold sm:col-span-2"><input type="checkbox" checked={editor.isFeatured} onChange={(event) => setEditor((state) => ({ ...state, isFeatured: event.target.checked }))} /><Star className="h-4 w-4 text-amber-500" />عنصر مميز</label>
          <div className="flex gap-2 sm:col-span-2"><button type="button" onClick={() => setEditorOpen(false)} className="flex-1 rounded-xl border p-3 text-xs">إلغاء</button><button disabled={savingItem || !editor.title.trim()} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 p-3 text-xs font-bold text-white disabled:bg-slate-300">{savingItem ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}حفظ</button></div>
        </form>
      )}

      <section className="divide-y divide-slate-100 border-y border-slate-200 bg-white sm:rounded-2xl sm:border">
        {items.length === 0 ? <div className="py-12 text-center"><Package className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-xs text-slate-400">لا توجد عناصر.</p></div> : items.map((item) => (
          <article key={item.id} className="flex items-center gap-3 px-3 py-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100">{item.is_featured ? <Star className="h-5 w-5 text-amber-500" /> : <Package className="h-5 w-5 text-slate-600" />}</div>
            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-xs font-bold">{item.title}</h3><span className={`rounded-full px-2 py-0.5 text-[8px] font-bold ${item.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{statusLabel(item)}</span></div><p className="mt-1 text-[9px] text-slate-400">{TYPE_LABELS[item.item_type]} · {priceLabel(item)}</p></div>
            <button onClick={() => openEditEditor(item)} className="rounded-xl border border-slate-200 p-2"><Pencil className="h-4 w-4" /></button>
            <button onClick={() => void toggleItem(item)} className="rounded-xl border border-slate-200 p-2"><EyeOff className="h-4 w-4" /></button>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <button type="button" onClick={() => setExternalOpen((value) => !value)} className="flex w-full items-center gap-3 px-4 py-4 text-right"><Package className="h-5 w-5 text-emerald-600" /><div className="flex-1"><h3 className="text-xs font-bold">كتالوج واتساب الخارجي</h3><p className="mt-1 text-[10px] text-slate-400">رابط اختياري بجانب كتالوج سند</p></div>{externalOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
        {externalOpen && <form onSubmit={saveExternal} className="space-y-3 border-t border-slate-100 p-4"><input value={catalogUrl} onChange={(event) => setCatalogUrl(event.target.value)} placeholder="https://wa.me/c/967..." dir="ltr" className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-left font-mono text-xs" />{catalogUrl.trim() && isValidCatalogUrl(catalogUrl.trim()) && <a href={catalogUrl.trim()} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700"><ExternalLink className="h-3.5 w-3.5" />فتح الرابط</a>}<button disabled={savingExternal} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 p-3 text-xs font-bold text-white">{savingExternal ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}حفظ الرابط</button></form>}
      </section>
    </div>
  );
}