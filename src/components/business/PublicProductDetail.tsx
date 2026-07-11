import React, { useEffect, useState } from 'react';
import { 
  ArrowRight, 
  Share2, 
  MessageSquare, 
  MapPin, 
  Loader2, 
  AlertTriangle, 
  Check,
  Copy, 
  Image as ImageIcon,
  Store,
  ChevronLeft
} from 'lucide-react';
import { 
  getPublicBusinessProfile, 
  getBusinessMediaSignedUrl 
} from '../../lib/businessApi';

interface PublicProductDetailProps {
  businessSlug: string;
  productId: string;
  onNavigate: (page: string, token?: string) => void;
}

function SimilarProductCardItem({ 
  prod, 
  businessSlug, 
  onNavigate 
}: { 
  prod: any; 
  businessSlug: string; 
  onNavigate: (page: string, token?: string) => void;
  key?: any;
}) {
  const [imgUrl, setImgUrl] = useState('');

  useEffect(() => {
    let active = true;
    if (prod.image_path) {
      getBusinessMediaSignedUrl(prod.image_path).then((url) => {
        if (active) setImgUrl(url);
      });
    } else {
      setImgUrl('');
    }
    return () => {
      active = false;
    };
  }, [prod.image_path]);

  return (
    <button
      onClick={() => onNavigate('public-product-detail', `${businessSlug}/${prod.id}`)}
      className="w-36 bg-white border border-slate-200 rounded-2xl overflow-hidden text-right transition-all flex flex-col shrink-0 hover:border-slate-350 active:scale-[0.98] shadow-3xs hover:shadow-2xs text-slate-800"
    >
      <div className="w-full aspect-square bg-slate-50 border-b border-slate-100 relative overflow-hidden">
        {imgUrl ? (
          <img src={imgUrl} alt={prod.name} className="w-full h-full object-cover object-center" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="w-5 h-5 text-slate-300" />
          </div>
        )}
      </div>
      <div className="p-2.5 flex-1 flex flex-col justify-between space-y-1">
        <h5 className="text-[10px] font-bold text-slate-900 line-clamp-1 leading-tight">{prod.name}</h5>
        <span className="text-[9px] font-extrabold text-indigo-700 font-mono">
          {prod.price ? prod.price : 'السعر عند الطلب'}
        </span>
      </div>
    </button>
  );
}

export default function PublicProductDetail({ 
  businessSlug, 
  productId, 
  onNavigate 
}: PublicProductDetailProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [product, setProduct] = useState<any | null>(null);
  
  const [imgUrl, setImgUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchProduct = async () => {
      setLoading(true);
      setError(null);
      try {
        const bizProfile = await getPublicBusinessProfile(businessSlug);
        if (!active) return;
        setProfile(bizProfile);

        const productsList = (bizProfile as any).profile_sections?.products || [];
        const foundProduct = productsList.find((p: any) => p.id === productId);
        
        if (!foundProduct) {
          setError('لم يتم العثور على المنتج المطلوب في الكتالوج.');
          return;
        }
        setProduct(foundProduct);

        // Resolve Image Signed URL
        if (foundProduct.image_path) {
          const url = await getBusinessMediaSignedUrl(foundProduct.image_path);
          if (active) setImgUrl(url);
        }
      } catch (err: any) {
        if (active) {
          setError(err.message || 'فشل في تحميل تفاصيل المنتج.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchProduct();
    return () => {
      active = false;
    };
  }, [businessSlug, productId]);

  const productUrl = `${window.location.origin}/b/${businessSlug}/p/${productId}`;

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: product?.name || 'تفاصيل المنتج',
          text: `شاهد المنتج: ${product?.name} على منصة سند`,
          url: productUrl,
        });
      } catch (err) {
        console.warn('Web Share failed, fallback to copy:', err);
        copyToClipboard();
      }
    } else {
      copyToClipboard();
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(productUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // WhatsApp Enquiry URL Builder
  const getWhatsappUrl = () => {
    if (!profile || !product) return '';
    const phone = profile.whatsapp || '';
    const priceText = product.price ? `السعر: ${product.price}` : 'السعر: عند الطلب';
    const message = `مرحباً، أود الاستفسار عن المنتج المعروض في صفحتكم على سند:
📦 المنتج: ${product.name}
💰 ${priceText}
🔗 رابط المنتج: ${productUrl}`;
    
    return product.whatsapp_url || `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50/50 flex flex-col items-center justify-center p-6 text-center font-arabic" dir="rtl">
        <Loader2 className="w-7 h-7 animate-spin text-slate-800" />
        <p className="text-xs text-slate-400 mt-2">جاري تحميل تفاصيل المنتج...</p>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-screen bg-slate-50/50 flex flex-col items-center justify-center p-6 text-center font-arabic" dir="rtl">
        <div className="p-4 bg-white border border-slate-200 rounded-3xl space-y-4 max-w-sm shadow-xs">
          <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto" />
          <div className="space-y-1">
            <h3 className="text-xs font-bold text-slate-900">حدث خطأ</h3>
            <p className="text-[10px] text-slate-550 leading-relaxed">
              {error || 'لم نتمكن من العثور على تفاصيل هذا المنتج.'}
            </p>
          </div>
          <button
            onClick={() => onNavigate('public-business-profile', businessSlug)}
            className="w-full bg-slate-900 text-white text-[10px] font-bold py-2.5 px-4 rounded-xl hover:bg-black transition-all"
          >
            العودة لصفحة النشاط
          </button>
        </div>
      </div>
    );
  }

  // Similar products filter
  const similarProducts = (profile?.profile_sections?.products || [])
    .filter((p: any) => p.id !== productId)
    .slice(0, 6);

  return (
    <div className="min-h-screen bg-slate-50/40 pb-28 font-arabic text-right relative flex flex-col" dir="rtl">
      {/* Dynamic Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200/50 px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => onNavigate('public-business-profile', businessSlug)}
          className="p-2 hover:bg-slate-100 rounded-xl transition-all border border-transparent hover:border-slate-200"
          aria-label="رجوع"
        >
          <ArrowRight className="w-4 h-4 text-slate-800" />
        </button>
        <span className="text-xs font-bold text-slate-900 max-w-[200px] truncate">{product.name}</span>
        <button
          onClick={handleShare}
          className="p-2 hover:bg-slate-100 rounded-xl transition-all border border-transparent hover:border-slate-200"
          aria-label="مشاركة"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Share2 className="w-4 h-4 text-slate-800" />}
        </button>
      </header>

      {/* Main Image Banner */}
      <section className="w-full max-w-lg mx-auto bg-white border-b border-slate-200/60 relative">
        <div className="w-full aspect-square md:aspect-[4/3] max-h-[450px] relative overflow-hidden flex items-center justify-center">
          {imgUrl ? (
            <img 
              src={imgUrl} 
              alt={product.name} 
              className="w-full h-full object-cover object-center" 
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 text-slate-300 space-y-1">
              <ImageIcon className="w-12 h-12 stroke-[1.5]" />
              <span className="text-[10px]">لا توجد صورة متوفرة</span>
            </div>
          )}
        </div>
      </section>

      {/* Product Information */}
      <main className="w-full max-w-lg mx-auto px-4 mt-4 space-y-4">
        {/* Info Card */}
        <div className="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-3xs space-y-3.5">
          <div className="space-y-1">
            <h1 className="text-sm font-bold text-slate-950 leading-snug">{product.name}</h1>
            <span className="inline-block text-[9px] bg-slate-100 border border-slate-200 text-slate-500 px-2 py-0.5 rounded-md font-bold">
              قسم الكتالوج
            </span>
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 pt-3">
            <div className="space-y-0.5">
              <span className="text-[9px] text-slate-400 block font-bold">سعر البيع</span>
              <span className="text-base font-extrabold text-indigo-700 font-mono">
                {product.price ? product.price : 'السعر عند الطلب'}
              </span>
            </div>

            <span className="text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 px-3 py-1 rounded-full">
              متوفر للطلب
            </span>
          </div>
        </div>

        {/* Copy Link toast notice */}
        {copied && (
          <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-800 text-[10px] font-bold rounded-2xl flex items-center gap-2 animate-scale-up">
            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>تم نسخ رابط المنتج إلى الحافظة! يمكنك الآن مشاركته مباشرة.</span>
          </div>
        )}

        {/* Description section */}
        {product.description && (
          <div className="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-3xs space-y-2">
            <h3 className="text-xs font-bold text-slate-900 border-r-2 border-indigo-600 pr-2">وصف وتفاصيل المنتج</h3>
            <p className="text-[11px] text-slate-655 leading-relaxed whitespace-pre-line">
              {product.description}
            </p>
          </div>
        )}

        {/* Specifications Table */}
        <div className="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-3xs space-y-3">
          <h3 className="text-xs font-bold text-slate-900 border-r-2 border-indigo-600 pr-2">المواصفات والخصائص</h3>
          <div className="divide-y divide-slate-100 text-[10px]">
            <div className="py-2.5 flex justify-between">
              <span className="text-slate-400 font-bold">حالة التوفر</span>
              <span className="text-slate-800 font-semibold">متوفر للطلب المباشر</span>
            </div>
            <div className="py-2.5 flex justify-between">
              <span className="text-slate-400 font-bold">شريك التوثيق</span>
              <span className="text-emerald-700 font-bold flex items-center gap-0.5">✓ منصة سند للتحقق</span>
            </div>
          </div>
        </div>

        {/* Merchant Card */}
        {profile && (
          <div className="bg-white border border-slate-200/60 rounded-3xl p-4.5 shadow-3xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-center shrink-0">
                <Store className="w-5 h-5 text-slate-455" />
              </div>
              <div className="space-y-0.5 min-w-0">
                <span className="text-[9px] text-slate-400 block">البائع والنشاط التجاري</span>
                <h4 className="text-xs font-bold text-slate-900 truncate">{profile.name}</h4>
              </div>
            </div>
            <button
              onClick={() => onNavigate('public-business-profile', businessSlug)}
              className="px-3 py-1.5 border border-slate-250 text-slate-700 hover:text-black hover:bg-slate-50 text-[9px] font-bold rounded-xl transition-all shrink-0 flex items-center gap-1"
            >
              <span>زيارة النشاط</span>
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Similar Products */}
        {similarProducts.length > 0 && (
          <div className="space-y-3 pt-2">
            <h3 className="text-xs font-bold text-slate-900 pr-1">منتجات أخرى قد تعجبك</h3>
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-3 px-1">
              {similarProducts.map((prod: any) => (
                <SimilarProductCardItem 
                  key={prod.id} 
                  prod={prod} 
                  businessSlug={businessSlug} 
                  onNavigate={onNavigate} 
                />
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Bottom Sticky Action Bar */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200/70 p-3 shadow-lg z-40 flex items-center justify-between gap-3">
        <div className="max-w-md mx-auto w-full flex items-center justify-between gap-3">
          <a
            href={getWhatsappUrl()}
            target="_blank"
            rel="noreferrer"
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold py-3.5 px-4 rounded-2xl transition-all shadow-sm flex items-center justify-center gap-2"
          >
            <MessageSquare className="w-4 h-4 fill-white" />
            <span>استفسار وطلب عبر واتساب</span>
          </a>

          <button
            onClick={copyToClipboard}
            className="p-3 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 rounded-2xl transition-all shrink-0"
            title="نسخ الرابط"
          >
            {copied ? <Check className="w-4.5 h-4.5 text-emerald-600" /> : <Copy className="w-4.5 h-4.5" />}
          </button>
        </div>
      </footer>
    </div>
  );
}
