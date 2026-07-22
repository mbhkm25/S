import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BadgeCheck, Building2, ChevronDown, MapPin, Search, Store } from 'lucide-react';
import { faqCategories, faqFallback, type FaqEntry } from './faqFallback';

type CatalogPreview = {
  id: string;
  type: string;
  title: string;
  description?: string | null;
  price?: number | null;
  currency?: string | null;
};

type PublicBusiness = {
  id: string;
  name: string;
  slug: string;
  tagline?: string | null;
  description?: string | null;
  category?: { id: string; code: string; name_ar: string } | null;
  governorate?: string | null;
  city?: string | null;
  verification_status?: string | null;
  public_url: string;
  catalog_preview?: CatalogPreview[];
};

type DirectoryData = {
  phase: 'prelaunch' | 'early_access' | 'public' | 'maintenance';
  registration_open: boolean;
  title: string;
  body: string;
  total: number;
  categories: { id: string; code: string; name_ar: string }[];
  governorates: string[];
  items: PublicBusiness[];
};

const directoryFallback: DirectoryData = {
  phase: 'prelaunch', registration_open: true, total: 0, categories: [], governorates: [], items: [],
  title: 'نبني دليل أعمال يستحق ثقتك',
  body: 'يجري الآن تجهيز مجتمع أعمال سند بأنشطة موثقة وبيانات مكتملة.'
};

async function callRpc<T>(apiUrl: string, apiKey: string, name: string, body: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${apiUrl}/rest/v1/rpc/${name}`, {
    method: 'POST', signal,
    headers: { apikey: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`${name} failed with ${response.status}`);
  return response.json() as Promise<T>;
}

export function BusinessDirectory({ apiUrl, apiKey, appUrl }: { apiUrl: string; apiKey: string; appUrl: string }) {
  const [data, setData] = useState<DirectoryData>(directoryFallback);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [governorate, setGovernorate] = useState('');
  const [loading, setLoading] = useState(Boolean(apiKey));

  useEffect(() => {
    if (!apiKey) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      callRpc<DirectoryData>(apiUrl, apiKey, 'get_public_business_directory', {
        p_search: search || null,
        p_category_id: category || null,
        p_governorate: governorate || null,
        p_limit: 24,
        p_offset: 0
      }, controller.signal)
        .then(value => setData({ ...directoryFallback, ...value, items: value.items || [], categories: value.categories || [], governorates: value.governorates || [] }))
        .catch(error => { if (error?.name !== 'AbortError') console.error('[SANAD landing] Directory request failed', error); })
        .finally(() => setLoading(false));
    }, search ? 350 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [apiUrl, apiKey, search, category, governorate]);

  const isClosed = data.phase === 'prelaunch' || data.phase === 'maintenance';
  return <section id="business-directory" className="directory-section">
    <div className="section-title"><span>دليل أعمال سند</span><h2>اكتشف ما يقدمه مجتمع الأعمال</h2><p>بحث موحد في الأنشطة والمنتجات والخدمات المنشورة.</p></div>
    {isClosed ? <div className="directory-gate"><div className="directory-orb"><Store /></div><div><small>{data.phase === 'maintenance' ? 'تحديث مؤقت' : 'قريبًا'}</small><h3>{data.title}</h3><p>{data.body}</p></div>{data.registration_open && <a href={appUrl}>أضف نشاطك من التطبيق <ArrowLeft /></a>}</div> : <>
      <div className="directory-tools">
        <label className="directory-search"><Search /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث عن نشاط أو منتج أو خدمة" aria-label="بحث دليل الأعمال" /></label>
        <select value={category} onChange={e => setCategory(e.target.value)} aria-label="تصنيف النشاط"><option value="">كل التصنيفات</option>{data.categories.map(item => <option key={item.id} value={item.id}>{item.name_ar}</option>)}</select>
        <select value={governorate} onChange={e => setGovernorate(e.target.value)} aria-label="المحافظة"><option value="">كل اليمن</option>{data.governorates.map(item => <option key={item} value={item}>{item}</option>)}</select>
      </div>
      <div className="directory-meta">{loading ? 'جاري تحديث النتائج…' : `${Number(data.total || 0).toLocaleString('en-US')} نشاط منشور`}</div>
      {!loading && data.items.length === 0 ? <div className="directory-empty"><Search /><h3>لا توجد نتيجة مطابقة</h3><p>جرّب اسمًا أو خدمة أو محافظة أخرى.</p></div> : <div className="business-cards">{data.items.map(business => <article className="business-card" key={business.id}>
        <div className="business-card-head"><div className="business-mark"><Building2 /></div><div><div className="business-title"><h3>{business.name}</h3>{business.verification_status === 'verified' && <BadgeCheck aria-label="نشاط موثق" />}</div><span>{business.category?.name_ar || 'نشاط تجاري'}</span></div></div>
        {(business.governorate || business.city) && <div className="business-location"><MapPin />{[business.city, business.governorate].filter(Boolean).join('، ')}</div>}
        <p>{business.tagline || business.description || 'اكتشف الملف العام والكتالوج المنشور لهذا النشاط.'}</p>
        {!!business.catalog_preview?.length && <div className="catalog-preview">{business.catalog_preview.map(item => <span key={item.id}><b>{item.title}</b>{item.price != null && <small>{Number(item.price).toLocaleString('en-US')} {item.currency || ''}</small>}</span>)}</div>}
        <a href={business.public_url} target="_blank" rel="noreferrer">عرض النشاط والكتالوج <ArrowLeft /></a>
      </article>)}</div>}
    </>}
  </section>;
}

export function PublicFaq({ apiUrl, apiKey }: { apiUrl: string; apiKey: string }) {
  const [items, setItems] = useState<FaqEntry[]>(faqFallback);
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!apiKey) return;
    const controller = new AbortController();
    callRpc<{ items?: FaqEntry[] }>(apiUrl, apiKey, 'get_public_sanad_faq', { p_category: null, p_search: null }, controller.signal)
      .then(value => { if (value.items?.length) setItems(value.items); })
      .catch(error => { if (error?.name !== 'AbortError') console.error('[SANAD landing] FAQ request failed', error); });
    return () => controller.abort();
  }, [apiUrl, apiKey]);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ar');
    return items.filter(item => (category === 'all' || item.category === category) && (!query || `${item.question} ${item.answer} ${(item.keywords || []).join(' ')}`.toLocaleLowerCase('ar').includes(query)));
  }, [items, category, search]);
  const visible = expanded || search || category !== 'all' ? filtered : filtered.slice(0, 8);

  return <section id="faq" className="faq">
    <div className="section-title"><span>الأسئلة الشائعة</span><h2>كل ما تحتاج معرفته عن سند</h2><p>إجابات موثوقة ومحدّثة من إعدادات المنصة الحالية.</p></div>
    <label className="faq-search"><Search /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="اكتب سؤالك أو كلمة مفتاحية" aria-label="بحث الأسئلة الشائعة" /></label>
    <div className="faq-categories" aria-label="فئات الأسئلة">{faqCategories.map(([code, label]) => <button className={category === code ? 'active' : ''} key={code} onClick={() => { setCategory(code); setExpanded(false); }}>{label}</button>)}</div>
    <div className="faq-grid">{visible.map(item => <details key={item.slug}><summary><span><small>{item.category_label}</small>{item.question}</span><ChevronDown /></summary><p>{item.answer}</p></details>)}</div>
    {filtered.length === 0 && <div className="faq-empty">لم نجد سؤالًا مطابقًا. جرّب كلمة أخرى أو تواصل مع الدعم.</div>}
    {!search && category === 'all' && filtered.length > 8 && <button className="faq-more" onClick={() => setExpanded(value => !value)}>{expanded ? 'عرض الأسئلة الأساسية' : `عرض جميع الأسئلة (${filtered.length.toLocaleString('en-US')})`}</button>}
  </section>;
}
