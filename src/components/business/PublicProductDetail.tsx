import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  Image as ImageIcon,
  Loader2,
  MessageCircle,
  Package,
  Share2,
  ShieldCheck
} from 'lucide-react';
import { getBusinessMediaSignedUrl, getPublicBusinessProfile } from '../../lib/businessApi';
import { buildPublicProductUrl } from '../../lib/urlUtils';

interface PublicProductDetailProps {
  businessSlug: string;
  productId: string;
  onNavigate: (page: string, token?: string) => void;
}

type CatalogItem = {
  id: string;
  title: string;
  description?: string | null;
  item_type?: string;
  price?: number | null;
  currency?: string | null;
  image_paths?: string[] | null;
  availability_status?: string;
  contact_action?: string;
  features?: unknown[];
};

function availabilityLabel(value?: string) {
  if (value === 'unavailable') return 'غير متاح حاليًا';
  if (value === 'on_request') return 'متاح عند الطلب';
  return 'متاح';
}

function priceLabel(item: CatalogItem) {
  if (item.price === null || item.price === undefined) return 'السعر عند الطلب';
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(item.price)}${item.currency ? ` ${item.currency}` : ''}`;
}

export default function PublicProductDetail({ businessSlug, productId, onNavigate }: PublicProductDetailProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [item, setItem] = useState<CatalogItem | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const business = await getPublicBusinessProfile(businessSlug) as any;
        if (!active) return;
        const items = Array.isArray(business.catalog_items) ? business.catalog_items as CatalogItem[] : [];
        const found = items.find((candidate) => candidate.id === productId) || null;
        if (!found) {
          setError('لم يتم العثور على العنصر المطلوب في كتالوج النشاط.');
          return;
        }
        setProfile(business);
        setItem(found);
        const imagePath = Array.isArray(found.image_paths) ? found.image_paths[0] : null;
        if (imagePath) {
          const resolved = await getBusinessMediaSignedUrl(imagePath);
          if (active) setImageUrl(resolved || '');
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'تعذر تحميل تفاصيل العنصر.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [businessSlug, productId]);

  const itemUrl = buildPublicProductUrl(businessSlug, productId);
  const whatsappUrl = useMemo(() => {
    if (!profile || !item || item.contact_action === 'none') return '';
    const phone = String(profile.whatsapp || '').replace(/\D/g, '');
    if (!phone) return '';
    const message = `مرحبًا، أريد الاستفسار عن ${item.title} المعروض في كتالوج ${profile.name} على سند.\n${priceLabel(item)}\n${itemUrl}`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  }, [item, itemUrl, profile]);

  const handleShare = async () => {
    if (!item) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: item.title, text: `شاهد ${item.title} على سند`, url: itemUrl });
        return;
      } catch {
        // Fall back to clipboard.
      }
    }
    await navigator.clipboard.writeText(itemUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-slate-800" /></div>;
  }

  if (!item || error) {
    return (
      <div className="mx-auto my-12 max-w-sm rounded-3xl border border-slate-200 bg-white p-6 text-center font-arabic" dir="rtl">
        <p className="text-xs leading-6 text-slate-600">{error || 'لم يتم العثور على العنصر.'}</p>
        <button onClick={() => onNavigate('public-business-profile', businessSlug)} className="mt-4 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white">العودة إلى النشاط</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24 font-arabic text-right" dir="rtl">
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white/95 px-3 py-3 backdrop-blur">
        <button onClick={() => onNavigate('public-business-profile', businessSlug)} className="rounded-xl border border-slate-200 p-2.5 text-slate-700" aria-label="العودة"><ArrowRight className="h-4 w-4" /></button>
        <h1 className="max-w-[65%] truncate text-xs font-bold text-slate-950">{item.title}</h1>
        <button onClick={() => void handleShare()} className="rounded-xl border border-slate-200 p-2.5 text-slate-700" aria-label="مشاركة">{copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Share2 className="h-4 w-4" />}</button>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-2 py-4 sm:px-4">
        <section className="overflow-hidden border-y border-slate-200 bg-white sm:rounded-3xl sm:border">
          <div className="aspect-[4/3] bg-slate-100">
            {imageUrl ? <img src={imageUrl} alt={item.title} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><ImageIcon className="h-12 w-12 text-slate-300" /></div>}
          </div>
          <div className="space-y-4 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold text-slate-950">{item.title}</h2>
                <p className="mt-1 text-[10px] text-slate-400">{item.item_type || 'catalog item'}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${item.availability_status === 'unavailable' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{availabilityLabel(item.availability_status)}</span>
            </div>
            <div className="flex items-center justify-between border-y border-slate-100 py-3">
              <span className="text-[10px] font-bold text-slate-400">السعر</span>
              <strong className="font-mono text-sm text-slate-950">{priceLabel(item)}</strong>
            </div>
            {item.description && <p className="whitespace-pre-line text-xs leading-7 text-slate-600">{item.description}</p>}
          </div>
        </section>

        <section className="border-y border-slate-200 bg-white px-4 py-4 sm:rounded-2xl sm:border">
          <div className="flex items-center gap-3"><Package className="h-5 w-5 text-slate-600" /><div><p className="text-xs font-bold text-slate-900">من كتالوج {profile?.name}</p><p className="mt-1 text-[10px] text-slate-400">نشاط ظاهر وموثوق عبر منصة سند</p></div>{profile?.verification_status === 'verified' && <ShieldCheck className="mr-auto h-5 w-5 text-emerald-600" />}</div>
        </section>
      </main>

      {whatsappUrl && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
          <a href={whatsappUrl} target="_blank" rel="noreferrer" className="mx-auto flex max-w-2xl items-center justify-center gap-2 rounded-2xl bg-slate-900 py-3.5 text-xs font-bold text-white">
            <MessageCircle className="h-5 w-5" /> استفسار عبر واتساب
          </a>
        </div>
      )}
    </div>
  );
}
