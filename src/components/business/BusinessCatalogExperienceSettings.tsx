import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, PackageCheck, Save, Star, Truck } from 'lucide-react';
import { getBusinessCatalog, type BusinessCatalogItem } from '../../lib/businessCatalogApi';
import {
  DEFAULT_CATALOG_DISPLAY_SETTINGS,
  DEFAULT_DELIVERY_SERVICE_SETTINGS,
  normalizeCatalogSettings,
  normalizeDeliverySettings,
  type CatalogCardEffect,
  type CatalogCardStyle,
  type CatalogDisplaySettings,
  type CatalogPriceDisplay,
  type DeliveryServiceSettings
} from '../../lib/businessCatalogExperience';
import {
  setBusinessCatalogExperienceSettings,
  type ManagementBusinessProfile
} from '../../lib/businessManagementApi';

interface Props {
  business: ManagementBusinessProfile;
  onSaved: (business: ManagementBusinessProfile) => void;
}

function splitList(value: string, limit: number): string[] {
  return value.split(/[،,\n]/).map(item => item.trim()).filter(Boolean).slice(0, limit);
}

function Toggle({ checked, onChange, label, description }: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
}) {
  return <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-right">
    <span className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition ${checked ? 'bg-emerald-600' : 'bg-slate-300'}`}>
      <span className={`h-5 w-5 rounded-full bg-white shadow transition ${checked ? '-translate-x-5' : ''}`} />
    </span>
    <span className="min-w-0 flex-1"><strong className="block text-xs text-slate-900">{label}</strong>{description&&<span className="mt-1 block text-[10px] leading-5 text-slate-500">{description}</span>}</span>
  </button>;
}

export default function BusinessCatalogExperienceSettings({ business, onSaved }: Props) {
  const [catalog, setCatalog] = useState<CatalogDisplaySettings>(() => normalizeCatalogSettings(business.catalog_display_settings || DEFAULT_CATALOG_DISPLAY_SETTINGS));
  const [delivery, setDelivery] = useState<DeliveryServiceSettings>(() => normalizeDeliverySettings(business.delivery_service_settings || DEFAULT_DELIVERY_SERVICE_SETTINGS));
  const [items, setItems] = useState<BusinessCatalogItem[]>([]);
  const [featuredIds, setFeaturedIds] = useState<string[]>((business.featured_item_ids || []).slice(0, 2));
  const [serviceAreasText, setServiceAreasText] = useState((business.delivery_service_settings?.service_areas || []).join('، '));
  const [deliveryTypesText, setDeliveryTypesText] = useState((business.delivery_service_settings?.delivery_types || []).join('، '));
  const [loadingItems, setLoadingItems] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoadingItems(true);
    void getBusinessCatalog(business.id, true).then(result => {
      if (active) setItems(result.filter(item => item.status === 'active'));
    }).catch(caught => {
      if (active) setError(caught instanceof Error ? caught.message : 'تعذر تحميل عناصر الكتالوج.');
    }).finally(() => { if (active) setLoadingItems(false); });
    return () => { active = false; };
  }, [business.id]);

  const selectedItems = useMemo(() => featuredIds.map(id => items.find(item => item.id === id)).filter(Boolean) as BusinessCatalogItem[], [featuredIds, items]);

  const toggleFeatured = (id: string) => {
    setFeaturedIds(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id].slice(-2));
  };

  const moveFeatured = (id: string, direction: -1 | 1) => {
    setFeaturedIds(current => {
      const index = current.indexOf(id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const save = async () => {
    setSaving(true); setError(null); setSuccess(null);
    try {
      const normalizedDelivery = normalizeDeliverySettings({
        ...delivery,
        service_areas: splitList(serviceAreasText, 30),
        delivery_types: splitList(deliveryTypesText, 12)
      });
      const updated = await setBusinessCatalogExperienceSettings({
        businessId: business.id,
        catalogDisplaySettings: normalizeCatalogSettings(catalog),
        deliveryServiceSettings: normalizedDelivery,
        featuredItemIds: featuredIds
      });
      setDelivery(normalizedDelivery);
      onSaved(updated);
      setSuccess('تم حفظ إعدادات الكتالوج والطلبات والتوصيل.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'تعذر حفظ الإعدادات.');
    } finally { setSaving(false); }
  };

  return <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4">
    <div className="flex items-start gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><PackageCheck className="h-5 w-5"/></span><div><h2 className="text-base font-bold">الكتالوج والطلبات</h2><p className="mt-1 text-[10px] leading-5 text-slate-500">إعداد تجربة العرض وقائمة الطلب الخفيفة وإرسالها عبر واتساب.</p></div></div>
    {error&&<div className="rounded-2xl bg-rose-50 p-3 text-xs text-rose-700">{error}</div>}
    {success&&<div className="rounded-2xl bg-emerald-50 p-3 text-xs text-emerald-700">{success}</div>}

    <div className="grid gap-2 sm:grid-cols-2">
      <Toggle checked={catalog.ordering_enabled} onChange={value=>setCatalog(current=>({...current,ordering_enabled:value}))} label="تفعيل قائمة الطلب" description="يجمع العميل العناصر محليًا ثم يرسلها عبر واتساب."/>
      <Toggle checked={catalog.allow_item_notes} onChange={value=>setCatalog(current=>({...current,allow_item_notes:value}))} label="السماح بملاحظات العناصر"/>
      <Toggle checked={catalog.show_prices} onChange={value=>setCatalog(current=>({...current,show_prices:value}))} label="إظهار الأسعار"/>
      <Toggle checked={catalog.show_total} onChange={value=>setCatalog(current=>({...current,show_total:value}))} label="إظهار الإجمالي حسب العملة"/>
      <Toggle checked={catalog.require_customer_name} onChange={value=>setCatalog(current=>({...current,require_customer_name:value}))} label="طلب اسم العميل"/>
      <Toggle checked={catalog.require_address} onChange={value=>setCatalog(current=>({...current,require_address:value}))} label="طلب عنوان العميل"/>
    </div>

    <div className="grid gap-3 sm:grid-cols-2">
      <label className="space-y-1 text-[10px] font-bold text-slate-600">نمط البطاقة<select value={catalog.card_style} onChange={event=>setCatalog(current=>({...current,card_style:event.target.value as CatalogCardStyle}))} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"><option value="modern">حديث ومتوازن</option><option value="compact">مضغوط</option><option value="visual">بصري</option></select></label>
      <label className="space-y-1 text-[10px] font-bold text-slate-600">المؤثر<select value={catalog.card_effect} onChange={event=>setCatalog(current=>({...current,card_effect:event.target.value as CatalogCardEffect}))} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"><option value="none">بدون مؤثر</option><option value="spotlight">Spotlight خفيف</option><option value="glow">وهج خفيف</option></select></label>
      <label className="space-y-1 text-[10px] font-bold text-slate-600">عرض العملة<select value={catalog.price_display} onChange={event=>setCatalog(current=>({...current,price_display:event.target.value as CatalogPriceDisplay}))} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"><option value="compact">مختصر: ر.ي / ر.س / $</option><option value="full">الاسم الكامل</option><option value="code">YER / SAR / USD</option></select></label>
      <label className="space-y-1 text-[10px] font-bold text-slate-600">الحد الأعلى للكمية<input type="number" min={1} max={99} value={catalog.max_item_quantity} onChange={event=>setCatalog(current=>({...current,max_item_quantity:Number(event.target.value)||1}))} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"/></label>
      <label className="space-y-1 text-[10px] font-bold text-slate-600">نص زر الإضافة<input value={catalog.add_button_label} maxLength={40} onChange={event=>setCatalog(current=>({...current,add_button_label:event.target.value}))} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"/></label>
      <label className="space-y-1 text-[10px] font-bold text-slate-600">نص زر الإرسال<input value={catalog.send_button_label} maxLength={60} onChange={event=>setCatalog(current=>({...current,send_button_label:event.target.value}))} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"/></label>
      <label className="space-y-1 text-[10px] font-bold text-slate-600">عبارة السعر غير المحدد<input value={catalog.missing_price_label} maxLength={60} onChange={event=>setCatalog(current=>({...current,missing_price_label:event.target.value}))} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"/></label>
      <label className="space-y-1 text-[10px] font-bold text-slate-600">عنوان العناصر المميزة<input value={catalog.featured_section_title||''} maxLength={80} onChange={event=>setCatalog(current=>({...current,featured_section_title:event.target.value||null}))} placeholder="مختارات من المنتجات" className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"/></label>
      <label className="space-y-1 text-[10px] font-bold text-slate-600 sm:col-span-2">مقدمة رسالة واتساب<textarea value={catalog.whatsapp_message_intro} rows={2} maxLength={240} onChange={event=>setCatalog(current=>({...current,whatsapp_message_intro:event.target.value}))} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"/></label>
    </div>

    <div className="space-y-3 rounded-2xl border border-slate-200 p-3"><div className="flex items-center gap-2"><Star className="h-4 w-4 text-amber-500"/><div><h3 className="text-xs font-bold">العنصران المميزان</h3><p className="text-[9px] text-slate-500">اختر عنصرين كحد أقصى، ثم اضبط ترتيبهما.</p></div></div>
      {loadingItems?<Loader2 className="mx-auto h-5 w-5 animate-spin"/>:<div className="grid gap-2 sm:grid-cols-2">{items.map(item=>{const selected=featuredIds.includes(item.id);return <button type="button" key={item.id} onClick={()=>toggleFeatured(item.id)} className={`relative rounded-2xl border p-3 text-right ${selected?'border-amber-400 bg-amber-50':'border-slate-200 bg-slate-50'}`}>{selected&&<Check className="absolute left-3 top-3 h-4 w-4 text-amber-600"/>}<strong className="block pr-1 text-xs">{item.title}</strong><span className="mt-1 block text-[9px] text-slate-500">{item.availability_status==='available'?'متاح':item.availability_status==='on_request'?'عند الطلب':'غير متاح'}</span></button>})}</div>}
      {selectedItems.length>0&&<div className="space-y-2">{selectedItems.map((item,index)=><div key={item.id} className="flex items-center gap-2 rounded-xl bg-slate-50 p-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-[10px] font-bold text-white">{index+1}</span><strong className="min-w-0 flex-1 truncate text-[10px]">{item.title}</strong><button type="button" disabled={index===0} onClick={()=>moveFeatured(item.id,-1)} className="rounded-lg border px-2 py-1 text-[10px] disabled:opacity-30">أعلى</button><button type="button" disabled={index===selectedItems.length-1} onClick={()=>moveFeatured(item.id,1)} className="rounded-lg border px-2 py-1 text-[10px] disabled:opacity-30">أسفل</button></div>)}</div>}
    </div>

    <div className="space-y-3 rounded-2xl border border-slate-200 p-3"><div className="flex items-center gap-2"><Truck className="h-5 w-5 text-sky-600"/><div><h3 className="text-xs font-bold">التوصيل</h3><p className="text-[9px] text-slate-500">إتاحة اختيار شركة توصيل، أو تسجيل هذا النشاط كمقدم خدمة توصيل.</p></div></div>
      <div className="grid gap-2 sm:grid-cols-2"><Toggle checked={delivery.customer_delivery_enabled} onChange={value=>setDelivery(current=>({...current,customer_delivery_enabled:value}))} label="السماح باختيار شركة توصيل"/><Toggle checked={delivery.is_delivery_provider} onChange={value=>setDelivery(current=>({...current,is_delivery_provider:value}))} label="هذا النشاط يقدم خدمة توصيل"/><Toggle checked={delivery.share_order_total} onChange={value=>setDelivery(current=>({...current,share_order_total:value}))} label="مشاركة إجمالي الطلب مع شركة التوصيل"/><Toggle checked={delivery.require_privacy_consent} onChange={value=>setDelivery(current=>({...current,require_privacy_consent:value}))} label="طلب موافقة مشاركة البيانات"/></div>
      {delivery.is_delivery_provider&&<div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-[10px] font-bold text-slate-600">مناطق الخدمة<textarea value={serviceAreasText} rows={3} onChange={event=>setServiceAreasText(event.target.value)} placeholder="المكلا، فوة، الديس" className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"/></label><label className="space-y-1 text-[10px] font-bold text-slate-600">أنواع التوصيل<textarea value={deliveryTypesText} rows={3} onChange={event=>setDeliveryTypesText(event.target.value)} placeholder="طلبات، طرود، مستندات" className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"/></label><label className="space-y-1 text-[10px] font-bold text-slate-600">ملاحظة التسعير<input value={delivery.pricing_note||''} onChange={event=>setDelivery(current=>({...current,pricing_note:event.target.value||null}))} placeholder="السعر حسب المنطقة" className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"/></label><label className="space-y-1 text-[10px] font-bold text-slate-600">ملاحظة التوفر<input value={delivery.availability_note||''} onChange={event=>setDelivery(current=>({...current,availability_note:event.target.value||null}))} placeholder="متاح من 8 صباحًا حتى 11 مساءً" className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"/></label></div>}
    </div>

    <button type="button" onClick={()=>void save()} disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 p-3.5 text-xs font-bold text-white disabled:bg-slate-300">{saving?<Loader2 className="h-4 w-4 animate-spin"/>:<Save className="h-4 w-4"/>}حفظ إعدادات الكتالوج والتوصيل</button>
  </section>;
}
