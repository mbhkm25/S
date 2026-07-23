import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2, ChevronDown, ChevronUp, Image as ImageIcon, Loader2, MapPin,
  MessageCircle, Minus, PackageCheck, Plus, Send, ShoppingBag, Trash2, Truck, X
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
  const settings = useMemo(() => normalizeCatalogSettings(business.catalog_display_settings), [business.catalog_display_settings]);
  const deliverySettings = useMemo(() => normalizeDeliverySettings(business.delivery_service_settings), [business.delivery_service_settings]);
  const [cart, setCart] = useState<CatalogCartItem[]>(() => readCatalogCart(business.id));
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [providers, setProviders] = useState<PublicDeliveryProvider[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<PublicDeliveryProvider | null>(null);
  const [customer, setCustomer] = useState<CatalogCustomerDetails>(EMPTY_CUSTOMER);
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentState, setSentState] = useState<'merchant' | 'delivery' | null>(null);

  useEffect(() => { writeCatalogCart(business.id, cart); }, [business.id, cart]);
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totals = useMemo(() => cartTotals(cart), [cart]);

  const add = (item: PublicOrderCatalogItem) => {
    setCart(current => upsertCartItem(current, {
      id: item.id,
      title: item.title,
      price: item.price == null ? null : Number(item.price),
      currency: item.currency || null
    }, settings.max_item_quantity));
    setSheetOpen(true);
  };

  const updateQuantity = (id: string, delta: number) => setCart(current => current
    .map(item => item.id === id ? { ...item, quantity: Math.max(0, Math.min(settings.max_item_quantity, item.quantity + delta)) } : item)
    .filter(item => item.quantity > 0));
  const updateNote = (id: string, note: string) => setCart(current => current.map(item => item.id === id ? { ...item, note: note.slice(0, 180) } : item));
  const remove = (id: string) => setCart(current => current.filter(item => item.id !== id));

  const validate = (forDelivery: boolean) => {
    if (!cart.length) return 'أضف عنصرًا واحدًا على الأقل.';
    if (settings.require_customer_name && !customer.name?.trim()) return 'اسم العميل مطلوب.';
    if ((settings.require_address || (forDelivery && deliverySettings.require_customer_address)) && !customer.address?.trim()) return 'عنوان العميل مطلوب.';
    if (forDelivery && deliverySettings.require_privacy_consent && !privacyConsent) return 'يجب الموافقة على مشاركة بيانات الطلب مع شركة التوصيل.';
    return null;
  };

  const context = () => ({
    reference: createOrderReference(),
    businessId: business.id,
    businessName: business.name,
    businessSlug: business.slug,
    businessWhatsapp: business.whatsapp || '',
    businessAddress: business.address_text,
    items: cart,
    customer
  });

  const sendMerchant = () => {
    const validation = validate(false); if (validation) { setError(validation); return; }
    try {
      openWhatsApp(business.whatsapp || '', buildMerchantWhatsAppMessage(context(), settings));
      setSentState('merchant'); setError(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر فتح واتساب.'); }
  };

  const loadProviders = async () => {
    setDeliveryOpen(true); setLoadingProviders(true); setError(null);
    try {
      const result = await getPublicDeliveryProviders({ governorate: business.governorate, city: business.city, limit: 30 });
      setProviders(result);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر تحميل شركات التوصيل.'); }
    finally { setLoadingProviders(false); }
  };

  const sendDelivery = () => {
    if (!selectedProvider) { setError('اختر شركة توصيل أولًا.'); return; }
    const validation = validate(true); if (validation) { setError(validation); return; }
    try {
      openWhatsApp(selectedProvider.whatsapp, buildDeliveryWhatsAppMessage(context(), selectedProvider, settings, deliverySettings));
      setSentState('delivery'); setError(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر فتح واتساب.'); }
  };

  const cardGrid = settings.card_style === 'compact' ? 'grid gap-2 sm:grid-cols-2' : 'grid grid-cols-2 gap-3 sm:grid-cols-3';
  return <section className="space-y-3">
    {error&&<div className="rounded-2xl border border-rose-100 bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
    <div className={cardGrid}>{items.map(item => {
      const unavailable = item.availability_status === 'unavailable';
      const visual = settings.card_style === 'visual';
      return <article key={item.id} className={`overflow-hidden rounded-[1.5rem] bg-white shadow-sm ${effectClass(settings)} ${settings.card_style==='compact'?'flex min-h-28':''}`}>
        <button type="button" onClick={()=>onOpenItem(item.id)} className={`text-right ${settings.card_style==='compact'?'w-28 shrink-0':'w-full'}`}>
          <div className={`${settings.card_style==='compact'?'h-full':'aspect-[4/3]'} bg-slate-100`}>{images[item.id]?<img src={images[item.id]} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover"/>:<div className="flex h-full items-center justify-center"><ImageIcon className="h-8 w-8 text-slate-300"/></div>}</div>
        </button>
        <div className={`flex min-w-0 flex-1 flex-col ${visual?'p-2.5':'p-3'}`}>
          <div className="flex items-center justify-between gap-2"><span className={`rounded-full px-2 py-1 text-[8px] font-bold ${unavailable?'bg-rose-50 text-rose-600':'bg-emerald-50 text-emerald-700'}`}>{availabilityLabel(item.availability_status)}</span><span className="text-[8px] text-slate-400">{item.item_type||itemLabel}</span></div>
          <button type="button" onClick={()=>onOpenItem(item.id)} className="mt-2 text-right"><h3 className="line-clamp-1 text-xs font-bold text-slate-950">{item.title}</h3>{!visual&&item.description&&<p className="mt-1 line-clamp-2 text-[9px] leading-5 text-slate-500">{item.description}</p>}</button>
          <div className="mt-auto pt-3"><p className="text-[11px] font-bold text-slate-950">{settings.show_prices?formatCatalogPrice(item.price, item.currency, settings.price_display, settings.missing_price_label):settings.missing_price_label}</p>{settings.ordering_enabled&&!unavailable&&<button type="button" onClick={()=>add(item)} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-2 py-2.5 text-[9px] font-bold text-white"><Plus className="h-3.5 w-3.5"/>{settings.add_button_label}</button>}</div>
        </div>
      </article>;
    })}</div>

    {settings.ordering_enabled&&count>0&&<button type="button" onClick={()=>setSheetOpen(true)} className="fixed bottom-5 left-1/2 z-40 flex w-[calc(100%-24px)] max-w-lg -translate-x-1/2 items-center gap-3 rounded-2xl bg-slate-950 p-3.5 text-white shadow-[0_18px_45px_rgba(15,23,42,.3)]"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400 text-sm font-bold text-emerald-950">{count}</span><span className="min-w-0 flex-1 text-right"><strong className="block text-xs">قائمة الطلب</strong><span className="text-[9px] text-white/60">مراجعة العناصر والإرسال عبر واتساب</span></span><ShoppingBag className="h-5 w-5"/></button>}

    {sheetOpen&&<div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true"><div className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-[2rem] bg-white p-4 shadow-2xl sm:rounded-[2rem]">
      <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100"><ShoppingBag className="h-5 w-5"/></span><div className="flex-1"><h2 className="text-sm font-bold">مراجعة الطلب</h2><p className="text-[9px] text-slate-500">لن تُمسح القائمة بعد فتح واتساب.</p></div><button type="button" onClick={()=>setSheetOpen(false)} className="rounded-xl bg-slate-100 p-2"><X className="h-4 w-4"/></button></div>
      <div className="mt-4 space-y-2">{cart.map(item=><article key={item.id} className="rounded-2xl border border-slate-200 p-3"><div className="flex items-start gap-2"><div className="min-w-0 flex-1"><h3 className="truncate text-xs font-bold">{item.title}</h3><p className="mt-1 text-[10px] text-slate-500">{formatCatalogPrice(item.price,item.currency,settings.price_display,settings.missing_price_label)}</p></div><button type="button" onClick={()=>remove(item.id)} className="rounded-lg p-1.5 text-rose-600"><Trash2 className="h-4 w-4"/></button></div><div className="mt-3 flex items-center gap-2"><button type="button" onClick={()=>updateQuantity(item.id,-1)} className="rounded-xl border p-2"><Minus className="h-3.5 w-3.5"/></button><strong className="min-w-8 text-center text-xs">{item.quantity}</strong><button type="button" onClick={()=>updateQuantity(item.id,1)} className="rounded-xl border p-2"><Plus className="h-3.5 w-3.5"/></button></div>{settings.allow_item_notes&&<input value={item.note||''} onChange={event=>updateNote(item.id,event.target.value)} maxLength={180} placeholder="ملاحظة على هذا العنصر" className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-[10px]"/>}</article>)}</div>
      {settings.show_total&&Object.keys(totals).length>0&&<div className="mt-4 rounded-2xl bg-slate-50 p-3"><p className="text-[10px] font-bold text-slate-600">الإجمالي بحسب العملة</p><div className="mt-2 flex flex-wrap gap-2">{Object.entries(totals).map(([currency,total])=><strong key={currency} className="rounded-full bg-white px-3 py-2 text-[10px] shadow-sm">{formatCatalogPrice(total,currency,settings.price_display,settings.missing_price_label)}</strong>)}</div></div>}
      <div className="mt-4 grid gap-2 sm:grid-cols-2"><input value={customer.name||''} onChange={event=>setCustomer(current=>({...current,name:event.target.value}))} placeholder={`اسم العميل${settings.require_customer_name?' *':''}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"/><input value={customer.phone||''} onChange={event=>setCustomer(current=>({...current,phone:event.target.value}))} placeholder="رقم التواصل" className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"/><input value={customer.area||''} onChange={event=>setCustomer(current=>({...current,area:event.target.value}))} placeholder="المنطقة" className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"/><input value={customer.address||''} onChange={event=>setCustomer(current=>({...current,address:event.target.value}))} placeholder={`العنوان${settings.require_address?' *':''}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"/><select value={customer.paymentMethod||'unspecified'} onChange={event=>setCustomer(current=>({...current,paymentMethod:event.target.value as CatalogCustomerDetails['paymentMethod']}))} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs sm:col-span-2"><option value="unspecified">حالة الدفع غير محددة</option><option value="paid">مدفوع</option><option value="cash_on_delivery">الدفع عند الاستلام</option></select><textarea value={customer.note||''} onChange={event=>setCustomer(current=>({...current,note:event.target.value}))} rows={2} maxLength={240} placeholder="ملاحظات عامة" className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs sm:col-span-2"/></div>
      {sentState&&<div className="mt-3 flex items-center gap-2 rounded-2xl bg-emerald-50 p-3 text-[10px] text-emerald-700"><CheckCircle2 className="h-4 w-4"/>{sentState==='merchant'?'تم فتح محادثة المتجر.':'طلب التوصيل قيد التنسيق عبر واتساب.'}</div>}
      <div className="mt-4 grid gap-2 sm:grid-cols-2"><button type="button" onClick={sendMerchant} className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 p-3.5 text-xs font-bold text-white"><MessageCircle className="h-4 w-4"/>{settings.send_button_label}</button>{deliverySettings.customer_delivery_enabled&&<button type="button" onClick={()=>void loadProviders()} className="flex items-center justify-center gap-2 rounded-2xl bg-sky-600 p-3.5 text-xs font-bold text-white"><Truck className="h-4 w-4"/>اختيار شركة توصيل</button>}</div>

      {deliveryOpen&&<div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50/40 p-3"><button type="button" onClick={()=>setDeliveryOpen(value=>!value)} className="flex w-full items-center gap-2 text-right"><Truck className="h-4 w-4 text-sky-600"/><strong className="flex-1 text-xs">شركات التوصيل المتاحة</strong>{deliveryOpen?<ChevronUp className="h-4 w-4"/>:<ChevronDown className="h-4 w-4"/>}</button>{loadingProviders?<Loader2 className="mx-auto mt-4 h-5 w-5 animate-spin"/>:<div className="mt-3 space-y-2">{providers.length?providers.map(provider=><button type="button" key={provider.id} onClick={()=>setSelectedProvider(provider)} className={`w-full rounded-2xl border p-3 text-right ${selectedProvider?.id===provider.id?'border-sky-500 bg-white':'border-slate-200 bg-white/70'}`}><div className="flex items-start gap-2"><div className="min-w-0 flex-1"><div className="flex items-center gap-1.5"><strong className="truncate text-xs">{provider.name}</strong>{provider.verification_status==='verified'&&<CheckCircle2 className="h-3.5 w-3.5 text-emerald-600"/>}</div><p className="mt-1 flex items-center gap-1 text-[9px] text-slate-500"><MapPin className="h-3 w-3"/>{provider.city}، {provider.governorate}</p>{provider.pricing_note&&<p className="mt-1 text-[9px] text-slate-500">{provider.pricing_note}</p>}</div>{selectedProvider?.id===provider.id&&<PackageCheck className="h-5 w-5 text-sky-600"/>}</div></button>):<p className="py-4 text-center text-[10px] text-slate-500">لا توجد شركة توصيل مطابقة حاليًا.</p>}</div>}
        {selectedProvider&&<><label className="mt-3 flex items-start gap-2 rounded-xl bg-white p-3 text-[10px] leading-5 text-slate-600"><input type="checkbox" checked={privacyConsent} onChange={event=>setPrivacyConsent(event.target.checked)} className="mt-1"/>أوافق على مشاركة بيانات الطلب ورقم التواصل والعنوان مع شركة التوصيل المختارة لغرض تنسيق التوصيل.</label><button type="button" onClick={sendDelivery} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-600 p-3.5 text-xs font-bold text-white"><Send className="h-4 w-4"/>إرسال طلب التوصيل عبر واتساب</button></>}
      </div>}
    </div></div>}
  </section>;
}
