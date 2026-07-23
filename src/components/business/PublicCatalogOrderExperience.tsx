import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, Image as ImageIcon, Loader2,
  MapPin, MessageCircle, Minus, PackageCheck, Plus, RotateCcw, Send,
  ShoppingBag, Trash2, Truck
} from 'lucide-react';
import {
  buildDeliveryWhatsAppMessage,
  buildMerchantWhatsAppMessage,
  cartTotals,
  createOrderReference,
  formatCatalogPrice,
  normalizeCatalogSettings,
  normalizeDeliverySettings,
  openWhatsApp,
  readCatalogCart,
  upsertCartItem,
  writeCatalogCart,
  type CatalogCartItem,
  type CatalogCustomerDetails,
  type CatalogDisplaySettings,
  type DeliveryServiceSettings,
  type PublicDeliveryProvider
} from '../../lib/businessCatalogExperience';
import { getPublicDeliveryProviders } from '../../lib/businessManagementApi';
import ResponsiveSheet from '../ui/ResponsiveSheet';

export type PublicOrderCatalogItem = {
  id: string;
  title: string;
  description?: string | null;
  item_type?: string | null;
  price?: number | null;
  currency?: string | null;
  image_paths?: string[] | null;
  availability_status?: string | null;
};

type OrderStep = 'review' | 'details' | 'delivery';

interface Props {
  business: {
    id: string;
    name: string;
    slug: string;
    whatsapp?: string | null;
    address_text?: string | null;
    governorate?: string | null;
    city?: string | null;
    catalog_display_settings?: CatalogDisplaySettings | null;
    delivery_service_settings?: DeliveryServiceSettings | null;
  };
  items: PublicOrderCatalogItem[];
  images: Record<string, string>;
  itemLabel: string;
  onOpenItem: (id: string) => void;
}

const EMPTY_CUSTOMER: CatalogCustomerDetails = { paymentMethod: 'unspecified' };
const ITEM_TYPE_LABELS: Record<string, string> = {
  product: 'منتج', service: 'خدمة', digital: 'عنصر رقمي', offer: 'عرض',
  subscription: 'اشتراك', other: 'عنصر'
};

function availabilityLabel(value?: string | null) {
  if (value === 'unavailable') return 'غير متاح';
  if (value === 'on_request') return 'عند الطلب';
  return 'متاح';
}

function effectClass(settings: CatalogDisplaySettings) {
  if (settings.card_effect === 'spotlight') return 'sanad-motion-glare';
  if (settings.card_effect === 'glow') return 'transition-shadow hover:shadow-[0_16px_45px_rgba(16,185,129,.16)]';
  return '';
}

export default function PublicCatalogOrderExperience({ business, items, images, itemLabel, onOpenItem }: Props) {
  const reduceMotion = useReducedMotion();
  const settings = useMemo(() => normalizeCatalogSettings(business.catalog_display_settings), [business.catalog_display_settings]);
  const deliverySettings = useMemo(() => normalizeDeliverySettings(business.delivery_service_settings), [business.delivery_service_settings]);
  const [cart, setCart] = useState<CatalogCartItem[]>(() => readCatalogCart(business.id));
  const [orderReference, setOrderReference] = useState(() => createOrderReference());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [step, setStep] = useState<OrderStep>('review');
  const [providers, setProviders] = useState<PublicDeliveryProvider[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<PublicDeliveryProvider | null>(null);
  const [customer, setCustomer] = useState<CatalogCustomerDetails>(EMPTY_CUSTOMER);
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [showOptional, setShowOptional] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentState, setSentState] = useState<'merchant' | 'delivery' | null>(null);

  useEffect(() => {
    setCart(readCatalogCart(business.id));
    setOrderReference(createOrderReference());
    setCustomer(EMPTY_CUSTOMER);
    setSelectedProvider(null);
    setPrivacyConsent(false);
    setSentState(null);
    setStep('review');
  }, [business.id]);
  useEffect(() => { writeCatalogCart(business.id, cart); }, [business.id, cart]);

  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalEntries = useMemo(
    () => Object.entries(cartTotals(cart)) as Array<[string, number]>,
    [cart]
  );

  const add = (item: PublicOrderCatalogItem) => {
    if (!settings.ordering_enabled || item.availability_status === 'unavailable') return;
    setCart(current => upsertCartItem(current, {
      id: item.id,
      title: item.title,
      price: item.price == null ? null : Number(item.price),
      currency: item.currency || null
    }, settings.max_item_quantity));
    setSentState(null);
    setStep('review');
    setSheetOpen(true);
  };

  const updateQuantity = (id: string, delta: number) => setCart(current => current
    .map(item => item.id === id ? { ...item, quantity: Math.max(0, Math.min(settings.max_item_quantity, item.quantity + delta)) } : item)
    .filter(item => item.quantity > 0));
  const remove = (id: string) => setCart(current => current.filter(item => item.id !== id));
  const updateNote = (id: string, note: string) => setCart(current => current.map(item => item.id === id ? { ...item, note: note.slice(0, 180) } : item));

  const startNewOrder = () => {
    setCart([]);
    setOrderReference(createOrderReference());
    setCustomer(EMPTY_CUSTOMER);
    setSelectedProvider(null);
    setPrivacyConsent(false);
    setShowOptional(false);
    setSentState(null);
    setError(null);
    setStep('review');
    setSheetOpen(false);
  };

  const validate = (forDelivery: boolean) => {
    if (!settings.ordering_enabled) return 'قائمة الطلب غير مفعلة لهذا النشاط.';
    if (!cart.length) return 'أضف عنصرًا واحدًا على الأقل.';
    if (settings.require_customer_name && !customer.name?.trim()) return 'اسم العميل مطلوب.';
    if (settings.require_address && !customer.address?.trim()) return 'عنوان العميل مطلوب.';
    if (forDelivery && deliverySettings.require_customer_address && !customer.address?.trim()) return 'عنوان الاستلام مطلوب للتوصيل.';
    if (forDelivery && deliverySettings.require_privacy_consent && !privacyConsent) return 'يجب الموافقة على مشاركة بيانات الطلب مع شركة التوصيل.';
    return null;
  };

  const context = () => ({
    reference: orderReference,
    businessId: business.id,
    businessName: business.name,
    businessSlug: business.slug,
    businessWhatsapp: business.whatsapp || '',
    businessAddress: business.address_text,
    items: cart,
    customer
  });

  const sendMerchant = () => {
    const validation = validate(false);
    if (validation) { setError(validation); return; }
    try {
      openWhatsApp(business.whatsapp || '', buildMerchantWhatsAppMessage(context(), settings));
      setSentState('merchant'); setError(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر فتح واتساب.'); }
  };

  const loadProviders = async () => {
    setStep('delivery');
    if (providers.length || loadingProviders) return;
    setLoadingProviders(true); setError(null);
    try {
      const result = await getPublicDeliveryProviders({ governorate: business.governorate, city: business.city, limit: 30 });
      setProviders(result.filter(provider => provider.id !== business.id));
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر تحميل شركات التوصيل.'); }
    finally { setLoadingProviders(false); }
  };

  const sendDelivery = () => {
    if (!selectedProvider) { setError('اختر شركة توصيل أولًا.'); return; }
    const validation = validate(true);
    if (validation) { setError(validation); return; }
    try {
      openWhatsApp(selectedProvider.whatsapp, buildDeliveryWhatsAppMessage(context(), selectedProvider, settings, deliverySettings));
      setSentState('delivery'); setError(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر فتح واتساب.'); }
  };

  const goToDetails = () => {
    if (!cart.length) { setError('أضف عنصرًا واحدًا على الأقل.'); return; }
    setError(null); setStep('details');
  };

  const footer = step === 'review'
    ? <button type="button" onClick={goToDetails} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-xs font-bold text-white">متابعة إلى بيانات الاستلام<ArrowLeft className="h-4 w-4"/></button>
    : step === 'details'
      ? <div className="grid gap-2 sm:grid-cols-2"><button type="button" onClick={sendMerchant} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 text-xs font-bold text-white"><MessageCircle className="h-4 w-4"/>{settings.send_button_label}</button>{deliverySettings.customer_delivery_enabled&&<button type="button" onClick={()=>void loadProviders()} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-sky-600 px-4 text-xs font-bold text-white"><Truck className="h-4 w-4"/>اختيار شركة توصيل</button>}</div>
      : <button type="button" onClick={sendDelivery} disabled={!selectedProvider} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-sky-600 px-4 text-xs font-bold text-white disabled:bg-slate-300"><Send className="h-4 w-4"/>إرسال طلب التوصيل عبر واتساب</button>;

  const cardGrid = settings.card_style === 'compact' ? 'grid gap-2 sm:grid-cols-2' : 'grid grid-cols-2 gap-3 sm:grid-cols-3';
  return <section className="space-y-3">
    {error&&!sheetOpen&&<div className="rounded-2xl border border-rose-100 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
    {!settings.ordering_enabled&&<div className="rounded-2xl border border-slate-200 bg-white p-3 text-[10px] leading-5 text-slate-500">يمكنك تصفح العناصر وتفاصيلها. استقبال الطلبات عبر القائمة غير مفعّل حاليًا.</div>}
    <div className={cardGrid}>{items.map((item, index) => {
      const unavailable = item.availability_status === 'unavailable';
      const visual = settings.card_style === 'visual';
      return <motion.article
        key={item.id}
        initial={reduceMotion ? false : { opacity: 0, y: 14 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ delay: reduceMotion ? 0 : Math.min(index * 0.045, 0.18), duration: 0.28 }}
        whileTap={reduceMotion ? undefined : { scale: 0.985 }}
        className={`overflow-hidden rounded-[1.5rem] bg-white shadow-sm ${effectClass(settings)} ${settings.card_style==='compact'?'flex min-h-28':''} ${unavailable?'opacity-75':''}`}
      >
        <button type="button" onClick={()=>onOpenItem(item.id)} className={`text-right ${settings.card_style==='compact'?'w-28 shrink-0':'w-full'}`}>
          <div className={`${settings.card_style==='compact'?'h-full':'aspect-[4/3]'} bg-slate-100`}>{images[item.id]?<img src={images[item.id]} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover"/>:<div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100"><ImageIcon className="h-8 w-8 text-slate-300"/></div>}</div>
        </button>
        <div className={`flex min-w-0 flex-1 flex-col ${visual?'p-2.5':'p-3'}`}>
          <div className="flex items-center justify-between gap-2"><span className={`rounded-full px-2 py-1 text-[8px] font-bold ${unavailable?'bg-rose-50 text-rose-600':'bg-emerald-50 text-emerald-700'}`}>{availabilityLabel(item.availability_status)}</span><span className="text-[8px] text-slate-400">{ITEM_TYPE_LABELS[item.item_type||'']||itemLabel}</span></div>
          <button type="button" onClick={()=>onOpenItem(item.id)} className="mt-2 text-right"><h3 className="line-clamp-1 text-xs font-bold text-slate-950">{item.title}</h3>{!visual&&item.description&&<p className="mt-1 line-clamp-2 text-[9px] leading-5 text-slate-500">{item.description}</p>}</button>
          <div className="mt-auto pt-3">{settings.show_prices&&<p className="text-[11px] font-bold text-slate-950">{formatCatalogPrice(item.price, item.currency, settings.price_display, settings.missing_price_label)}</p>}{settings.ordering_enabled&&!unavailable&&<button type="button" onClick={()=>add(item)} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-2 py-2.5 text-[9px] font-bold text-white active:scale-[.98]"><Plus className="h-3.5 w-3.5"/>{settings.add_button_label}</button>}</div>
        </div>
      </motion.article>;
    })}</div>

    {settings.ordering_enabled&&count>0&&<button type="button" onClick={()=>{setStep('review');setSheetOpen(true);}} className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-40 flex w-[calc(100%-24px)] max-w-lg -translate-x-1/2 items-center gap-3 rounded-2xl bg-slate-950 p-3.5 text-white shadow-[0_18px_45px_rgba(15,23,42,.3)] active:scale-[.99]"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400 text-sm font-bold text-emerald-950">{count}</span><span className="min-w-0 flex-1 text-right"><strong className="block text-xs">قائمة الطلب</strong><span className="text-[9px] text-white/60">مرجع {orderReference}</span></span><ShoppingBag className="h-5 w-5"/></button>}

    <ResponsiveSheet
      open={sheetOpen&&settings.ordering_enabled}
      onClose={()=>setSheetOpen(false)}
      title={step==='review'?'مراجعة الطلب':step==='details'?'بيانات الاستلام':'اختيار شركة التوصيل'}
      description={`مرجع الطلب: ${orderReference}`}
      className="sm:max-w-2xl"
      footer={footer}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">{(['review','details','delivery'] as OrderStep[]).map((item,index)=>{
          const active=item===step;const disabled=item==='delivery'&&!deliverySettings.customer_delivery_enabled;
          return <div key={item} className={`rounded-xl px-2 py-2 text-center text-[9px] font-bold ${active?'bg-slate-950 text-white':disabled?'bg-slate-50 text-slate-300':'bg-slate-100 text-slate-500'}`}>{index+1}. {item==='review'?'الطلب':item==='details'?'الاستلام':'التوصيل'}</div>;
        })}</div>
        {error&&<div className="rounded-2xl border border-rose-100 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={step} initial={reduceMotion?false:{opacity:0,x:16}} animate={{opacity:1,x:0}} exit={reduceMotion?{opacity:0}:{opacity:0,x:-12}} transition={{duration:reduceMotion?0:.2}}>
            {step==='review'&&<div className="space-y-3">
              <div className="space-y-2">{cart.map(item=><article key={item.id} className="rounded-2xl border border-slate-200 p-3"><div className="flex items-start gap-2"><div className="min-w-0 flex-1"><h3 className="truncate text-xs font-bold">{item.title}</h3>{settings.show_prices&&<p className="mt-1 text-[10px] text-slate-500">{formatCatalogPrice(item.price,item.currency,settings.price_display,settings.missing_price_label)}</p>}</div><button type="button" onClick={()=>remove(item.id)} className="rounded-lg p-1.5 text-rose-600" aria-label="حذف العنصر"><Trash2 className="h-4 w-4"/></button></div><div className="mt-3 flex items-center gap-2"><button type="button" onClick={()=>updateQuantity(item.id,-1)} className="rounded-xl border p-2"><Minus className="h-3.5 w-3.5"/></button><strong className="min-w-8 text-center text-xs">{item.quantity}</strong><button type="button" onClick={()=>updateQuantity(item.id,1)} className="rounded-xl border p-2"><Plus className="h-3.5 w-3.5"/></button></div>{settings.allow_item_notes&&<input value={item.note||''} onChange={event=>updateNote(item.id,event.target.value)} maxLength={180} placeholder="ملاحظة على هذا العنصر" className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-[10px]"/>}</article>)}</div>
              {settings.show_total&&totalEntries.length>0&&<div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] font-bold text-slate-600">الإجمالي</p><div className="mt-2 flex flex-wrap gap-2">{totalEntries.map(([currency,total])=><strong key={currency} className="rounded-full bg-white px-3 py-2 text-[10px] shadow-sm">{formatCatalogPrice(total,currency,settings.price_display,settings.missing_price_label)}</strong>)}</div></div>}
            </div>}

            {step==='details'&&<section className="space-y-4"><div><h3 className="text-xs font-bold text-slate-900">بيانات العميل والاستلام</h3><p className="mt-1 text-[9px] text-slate-500">أدخل المعلومات الضرورية فقط. الحقول الإضافية اختيارية.</p></div><div className="grid gap-2 sm:grid-cols-2"><input value={customer.name||''} onChange={event=>setCustomer(current=>({...current,name:event.target.value}))} placeholder={`اسم العميل${settings.require_customer_name?' *':''}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"/><input value={customer.phone||''} onChange={event=>setCustomer(current=>({...current,phone:event.target.value}))} placeholder="رقم التواصل" className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"/><input value={customer.area||''} onChange={event=>setCustomer(current=>({...current,area:event.target.value}))} placeholder="المنطقة" className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"/><input value={customer.address||''} onChange={event=>setCustomer(current=>({...current,address:event.target.value}))} placeholder={`عنوان الاستلام${settings.require_address?' *':''}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"/></div><button type="button" onClick={()=>setShowOptional(value=>!value)} className="flex w-full items-center justify-between rounded-xl border border-dashed border-slate-300 p-3 text-[10px] font-bold text-slate-600"><span>خيارات إضافية</span><motion.span animate={{rotate:showOptional?180:0}}><ChevronDown className="h-4 w-4"/></motion.span></button><AnimatePresence initial={false}>{showOptional&&<motion.div initial={{height:0,opacity:0}} animate={{height:'auto',opacity:1}} exit={{height:0,opacity:0}} className="overflow-hidden"><div className="space-y-2 pt-1"><select value={customer.paymentMethod||'unspecified'} onChange={event=>setCustomer(current=>({...current,paymentMethod:event.target.value as CatalogCustomerDetails['paymentMethod']}))} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"><option value="unspecified">حالة الدفع غير محددة</option><option value="paid">مدفوع</option><option value="cash_on_delivery">الدفع عند الاستلام</option></select><textarea value={customer.note||''} onChange={event=>setCustomer(current=>({...current,note:event.target.value}))} rows={2} maxLength={240} placeholder="ملاحظات عامة" className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"/></div></motion.div>}</AnimatePresence>{sentState&&<div className="flex items-center gap-2 rounded-2xl bg-emerald-50 p-3 text-[10px] text-emerald-700"><CheckCircle2 className="h-4 w-4"/>{sentState==='merchant'?'تم فتح محادثة المتجر بهذا المرجع.':'تم فتح محادثة شركة التوصيل بالمرجع نفسه.'}</div>}<button type="button" onClick={()=>setStep('review')} className="flex items-center gap-2 text-[10px] font-bold text-slate-500"><ArrowRight className="h-4 w-4"/>العودة إلى مراجعة الطلب</button></section>}

            {step==='delivery'&&<section className="space-y-3">{loadingProviders?<div className="py-10 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-sky-600"/><p className="mt-2 text-[10px] text-slate-500">جارٍ تحميل شركات التوصيل...</p></div>:providers.length?<div className="space-y-2">{providers.map(provider=><button type="button" key={provider.id} onClick={()=>{setSelectedProvider(provider);setPrivacyConsent(false);setError(null);}} className={`w-full rounded-2xl border p-3 text-right ${selectedProvider?.id===provider.id?'border-sky-500 bg-sky-50':'border-slate-200 bg-white'}`}><div className="flex items-start gap-2"><div className="min-w-0 flex-1"><div className="flex items-center gap-1.5"><strong className="truncate text-xs">{provider.name}</strong>{provider.verification_status==='verified'&&<CheckCircle2 className="h-3.5 w-3.5 text-emerald-600"/>}</div><p className="mt-1 flex items-center gap-1 text-[9px] text-slate-500"><MapPin className="h-3 w-3"/>{provider.city}، {provider.governorate}</p>{provider.pricing_note&&<p className="mt-1 text-[9px] text-slate-500">{provider.pricing_note}</p>}{provider.availability_note&&<p className="mt-1 text-[9px] text-slate-500">{provider.availability_note}</p>}</div>{selectedProvider?.id===provider.id&&<PackageCheck className="h-5 w-5 text-sky-600"/>}</div></button>)}</div>:<p className="rounded-2xl bg-slate-50 p-6 text-center text-[10px] text-slate-500">لا توجد شركة توصيل مطابقة حاليًا.</p>}{selectedProvider&&deliverySettings.require_privacy_consent&&<label className="flex items-start gap-2 rounded-xl bg-sky-50 p-3 text-[10px] leading-5 text-slate-600"><input type="checkbox" checked={privacyConsent} onChange={event=>setPrivacyConsent(event.target.checked)} className="mt-1"/>أوافق على مشاركة بيانات الطلب ورقم التواصل والعنوان مع شركة التوصيل المختارة لغرض تنسيق التوصيل فقط.</label>}<button type="button" onClick={()=>setStep('details')} className="flex items-center gap-2 text-[10px] font-bold text-slate-500"><ArrowRight className="h-4 w-4"/>العودة إلى بيانات الاستلام</button></section>}
          </motion.div>
        </AnimatePresence>
        <button type="button" onClick={startNewOrder} className="flex w-full items-center justify-center gap-2 p-2 text-[9px] font-bold text-slate-400"><RotateCcw className="h-3.5 w-3.5"/>بدء طلب جديد ومسح القائمة</button>
      </div>
    </ResponsiveSheet>
  </section>;
}
