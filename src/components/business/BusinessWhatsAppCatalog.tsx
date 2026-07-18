import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  AlertCircle,
  ArrowRight,
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
import { toLatinDigits } from '../../lib/digits';

interface BusinessWhatsAppCatalogProps {
  onNavigate: (page: string) => void;
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

export default function BusinessWhatsAppCatalog({ onNavigate }: BusinessWhatsAppCatalogProps) {
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

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const contexts = await getUserBusinessContexts();
      const current = contexts.owned_businesses?.[0] || null;
      if (!current) throw new Error('فقط مالك النشاط يمكنه إدارة الكتالوج.');
      setBusiness(current);
      setCatalogUrl((current as BusinessProfile & { whatsapp_catalog_url?: string | null }).whatsapp_catalog_url || '');
      setItems(await getBusinessCatalog(current.id, true));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر تحميل الكتالوج.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

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

  const handleSaveItem = async (event: FormEvent<HTMLFormElement>) => {
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
      setSuccess(editor.itemId ? 'تم تحديث العنصر.' : 'تمت إضافة العنصر إلى الكتالوج.');
      setEditor(EMPTY_EDITOR);
      setEditorOpen(false);
      setItems(await getBusinessCatalog(business.id, true));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر حفظ العنصر.');
    } finally {
      setSavingItem(false);
    }
  };

  const handleHideItem = async (item: BusinessCatalogItem) => {
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
      setSuccess(item.status === 'active' ? 'تم إخفاء العنصر من الملف العام.' : 'تم نشر العنصر في الملف العام.');
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

  const handleSaveExternal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!business) return;
    const cleanUrl = catalogUrl.trim();
    if (!isValidCatalogUrl(cleanUrl)) {
      setError('أدخل رابطًا صحيحًا يبدأ بـ https:// أو اتركه فارغًا.');
      return;
    }
    setSavingExternal(true);
    setError(null);
    setSuccess(null);
    try {
      await updateBusinessProfile({
        p_business_id: business.id,
        p_name: business.name,
        p_description: business.description || null,
        p_category_id: business.category_id || null,
        p_governorate: business.governorate,
        p_city: business.city,
        p_whatsapp: business.whatsapp || null,
        p_whatsapp_catalog_url: cleanUrl || null
      });
      setSuccess(cleanUrl ? 'تم حفظ رابط كتالوج واتساب.' : 'تمت إزالة رابط كتالوج واتساب.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر حفظ رابط كتالوج واتساب.');
    } finally {
      setSavingExternal(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 font-arabic">
        <Loader2 className="h-6 w-6 animate-spin text-slate-800" />
        <span className="text-xs text-slate-500">جاري تحميل كتالوج النشاط...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5 font-arabic text-right" dir="rtl">
      <header className="flex items-start gap-3">
        <button type="button" onClick={() => onNavigate('business-manage')} className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-700" aria-label="العودة">
          <ArrowRight className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold text-slate-950">كتالوج النشاط</h1>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">إدارة العناصر الرئيسية التي تظهر في الملف العام للنشاط.</p>
        </div>
        <button type="button" onClick={openNewEditor} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2.5 text-[10px] font-bold text-white">
          <Plus className="h-4 w-4" /> عنصر جديد
        </button>
      </header>

      {error && <div className="flex items-start gap-2 rounded-2xl border border-rose-100 bg-rose-50 p-3 text-xs text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      {success && <div className="flex items-start gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{success}</div>}

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center"><span className="block font-mono text-lg font-bold text-slate-950">{toLatinDigits(String(items.length))}</span><span className="text-[9px] text-slate-400">كل العناصر</span></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center"><span className="block font-mono text-lg font-bold text-slate-950">{toLatinDigits(String(activeCount))}</span><span className="text-[9px] text-slate-400">المنشورة من 10</span></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center"><span className="block font-mono text-lg font-bold text-slate-950">{toLatinDigits(String(featuredCount))}</span><span className="text-[9px] text-slate-400">المميزة</span></div>
      </div>

      {editorOpen && (
        <section className="border-y border-slate-200 bg-white px-3 py-4 sm:rounded-2xl sm:border">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div><h2 className="text-sm font-bold text-slate-950">{editor.itemId ? 'تعديل العنصر' : 'إضافة عنصر جديد'}</h2><p className="mt-1 text-[10px] text-slate-400">العناصر المنشورة تظهر في الملف العام فورًا.</p></div>
            <button type="button" onClick={() => setEditorOpen(false)} className="rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-500">إغلاق</button>
          </div>
          <form onSubmit={handleSaveItem} className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className="mb-1.5 block text-[10px] font-bold text-slate-600">اسم العنصر</label><input value={editor.title} onChange={(event) => setEditor((state) => ({ ...state, title: event.target.value }))} maxLength={120} required className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs outline-none focus:border-slate-400" /></div>
            <div className="sm:col-span-2"><label className="mb-1.5 block text-[10px] font-bold text-slate-600">وصف مختصر</label><textarea value={editor.description} onChange={(event) => setEditor((state) => ({ ...state, description: event.target.value }))} rows={3} maxLength={500} className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs outline-none focus:border-slate-400" /></div>
            <div><label className="mb-1.5 block text-[10px] font-bold text-slate-600">نوع العنصر</label><select value={editor.itemType} onChange={(event) => setEditor((state) => ({ ...state, itemType: event.target.value as BusinessCatalogItemType }))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs">{Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            <div><label className="mb-1.5 block text-[10px] font-bold text-slate-600">حالة التوفر</label><select value={editor.availabilityStatus} onChange={(event) => setEditor((state) => ({ ...state, availabilityStatus: event.target.value as BusinessCatalogAvailability }))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs"><option value="available">متاح</option><option value="on_request">متاح عند الطلب</option><option value="unavailable">غير متاح حاليًا</option></select></div>
            <div><label className="mb-1.5 block text-[10px] font-bold text-slate-600">السعر (اختياري)</label><input value={editor.price} onChange={(event) => setEditor((state) => ({ ...state, price: toLatinDigits(event.target.value).replace(/[^0-9.]/g, '') }))} inputMode="decimal" className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left font-mono text-xs" dir="ltr" /></div>
            <div><label className="mb-1.5 block text-[10px] font-bold text-slate-600">العملة</label><select value={editor.currency} onChange={(event) => setEditor((state) => ({ ...state, currency: event.target.value as EditorState['currency'] }))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs"><option value="">بدون عملة</option><option value="YER">YER</option><option value="SAR">SAR</option><option value="USD">USD</option></select></div>
            <div><label className="mb-1.5 block text-[10px] font-bold text-slate-600">حالة النشر</label><select value={editor.status} onChange={(event) => setEditor((state) => ({ ...state, status: event.target.value as BusinessCatalogItemStatus }))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs"><option value="active">منشور</option><option value="draft">مسودة</option><option value="hidden">مخفي</option></select></div>
            <div><label className="mb-1.5 block text-[10px] font-bold text-slate-600">ترتيب العرض</label><input value={editor.displayOrder} onChange={(event) => setEditor((state) => ({ ...state, displayOrder: toLatinDigits(event.target.value).replace(/\D/g, '') }))} inputMode="numeric" className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left font-mono text-xs" dir="ltr" /></div>
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold text-slate-700 sm:col-span-2"><input type="checkbox" checked={editor.isFeatured} onChange={(event) => setEditor((state) => ({ ...state, isFeatured: event.target.checked }))} className="h-4 w-4" /><Star className="h-4 w-4 text-amber-500" />عرضه كعنصر مميز</label>
            <button type="submit" disabled={savingItem || !editor.title.trim()} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 py-3.5 text-xs font-bold text-white disabled:bg-slate-300 sm:col-span-2">{savingItem ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} حفظ العنصر</button>
          </form>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="text-sm font-bold text-slate-950">عناصر الكتالوج</h2><span className="text-[10px] text-slate-400">الحد المنشور: 10</span></div>
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center"><Package className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-xs text-slate-500">لم تضف أي عناصر بعد.</p></div>
        ) : (
          <div className="divide-y divide-slate-100 border-y border-slate-200 bg-white sm:rounded-2xl sm:border">
            {items.map((item) => (
              <article key={item.id} className="flex items-center gap-3 px-3 py-3.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">{item.is_featured ? <Star className="h-5 w-5 text-amber-500" /> : <Package className="h-5 w-5" />}</div>
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-xs font-bold text-slate-900">{item.title}</h3><span className={`rounded-full px-2 py-0.5 text-[8px] font-bold ${item.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{statusLabel(item)}</span></div><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-slate-400"><span>{TYPE_LABELS[item.item_type]}</span><span>{priceLabel(item)}</span></div></div>
                <button type="button" onClick={() => openEditEditor(item)} className="rounded-xl border border-slate-200 p-2 text-slate-600" aria-label="تعديل"><Pencil className="h-4 w-4" /></button>
                <button type="button" onClick={() => void handleHideItem(item)} className="rounded-xl border border-slate-200 p-2 text-slate-600" aria-label={item.status === 'active' ? 'إخفاء' : 'نشر'}><EyeOff className="h-4 w-4" /></button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <button type="button" onClick={() => setExternalOpen((value) => !value)} className="flex w-full items-center gap-3 px-4 py-4 text-right" aria-expanded={externalOpen}><Package className="h-5 w-5 text-emerald-600" /><div className="flex-1"><h2 className="text-xs font-bold text-slate-900">كتالوج واتساب الخارجي</h2><p className="mt-1 text-[10px] text-slate-400">رابط اختياري يظهر بجانب كتالوج سند</p></div>{externalOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}</button>
        {externalOpen && (
          <form onSubmit={handleSaveExternal} className="space-y-3 border-t border-slate-100 p-4"><input value={catalogUrl} onChange={(event) => setCatalogUrl(event.target.value)} placeholder="https://wa.me/c/967..." dir="ltr" className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left font-mono text-xs" />{catalogUrl.trim() && isValidCatalogUrl(catalogUrl.trim()) && <a href={catalogUrl.trim()} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-700"><ExternalLink className="h-3.5 w-3.5" />فتح الرابط للتأكد</a>}<button type="submit" disabled={savingExternal} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 py-3 text-xs font-bold text-white">{savingExternal ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}حفظ رابط واتساب</button></form>
        )}
      </section>
    </div>
  );
}
