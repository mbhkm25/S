import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ChevronLeft,
  Loader2,
  MessageCircle,
  Search,
  Send,
  StickyNote,
  User,
  Users,
  X
} from 'lucide-react';
import { getUserBusinessContexts } from '../../lib/businessApi';
import {
  addBusinessCustomerNote,
  getBusinessCustomerDetail,
  getBusinessCustomers,
  recordBusinessCustomerCommunication,
  type BusinessCustomerDetail,
  type BusinessCustomerItem,
  type CustomerEngagementState
} from '../../lib/businessCustomersApi';
import { toLatinDigits } from '../../lib/digits';

interface BusinessCustomersProps {
  onNavigate: (page: string, token?: string) => void;
  businessId?: string;
}

const stateLabels: Record<Exclude<CustomerEngagementState, 'all'>, string> = {
  active: 'نشط',
  inactive: 'خامل',
  new: 'جديد'
};

const stateClasses: Record<Exclude<CustomerEngagementState, 'all'>, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  inactive: 'bg-amber-50 text-amber-700 border-amber-100',
  new: 'bg-blue-50 text-blue-700 border-blue-100'
};

function formatDate(value?: string | null) {
  if (!value) return 'لم يُسجّل بعد';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'غير متوفر';
  return new Intl.DateTimeFormat('ar-YE-u-nu-latn', {
    dateStyle: 'medium',
    timeZone: 'Asia/Aden',
    numberingSystem: 'latn'
  }).format(date);
}

function normalizeWhatsapp(phone?: string | null) {
  const digits = toLatinDigits(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('967') && digits.length === 12) return digits;
  if (digits.startsWith('00967')) return digits.slice(2);
  if (digits.length === 9 && digits.startsWith('7')) return `967${digits}`;
  return digits;
}

export default function BusinessCustomers({ businessId }: BusinessCustomersProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<BusinessCustomerItem[]>([]);
  const [bizId, setBizId] = useState<string | null>(businessId || null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<CustomerEngagementState>('all');
  const [selectedCustomer, setSelectedCustomer] = useState<BusinessCustomerItem | null>(null);
  const [detail, setDetail] = useState<BusinessCustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const loadCustomers = useCallback(async (id?: string) => {
    setLoading(true);
    setError(null);
    try {
      let target = id || bizId;
      if (!target) {
        const contexts = await getUserBusinessContexts();
        const current = contexts.owned_businesses?.[0] || contexts.team_businesses?.[0] || null;
        target = current?.id;
        setBizId(target || null);
      }
      if (!target) {
        setCustomers([]);
        setError('لا يوجد نشاط متاح لتحميل العملاء.');
        return;
      }
      setCustomers(await getBusinessCustomers(target));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'فشل تحميل قائمة العملاء.');
    } finally {
      setLoading(false);
    }
  }, [bizId]);

  useEffect(() => {
    void loadCustomers(businessId);
  }, [businessId, loadCustomers]);

  const loadDetail = useCallback(async (customer: BusinessCustomerItem) => {
    const targetBusinessId = businessId || bizId;
    if (!targetBusinessId) return;
    setSelectedCustomer(customer);
    setDetailLoading(true);
    setDetailError(null);
    try {
      setDetail(await getBusinessCustomerDetail(targetBusinessId, customer.user_id));
    } catch (caught) {
      setDetailError(caught instanceof Error ? caught.message : 'تعذر تحميل ملف العميل.');
    } finally {
      setDetailLoading(false);
    }
  }, [businessId, bizId]);

  const counts = useMemo(() => ({
    all: customers.length,
    active: customers.filter((item) => item.engagement_state === 'active').length,
    inactive: customers.filter((item) => item.engagement_state === 'inactive').length,
    new: customers.filter((item) => item.engagement_state === 'new').length
  }), [customers]);

  const filteredCustomers = useMemo(() => {
    const term = toLatinDigits(search).trim().toLowerCase();
    return customers.filter((customer) => {
      const matchesFilter = filter === 'all' || customer.engagement_state === filter;
      const matchesSearch = !term ||
        (customer.full_name || '').toLowerCase().includes(term) ||
        toLatinDigits(customer.phone || '').includes(term);
      return matchesFilter && matchesSearch;
    });
  }, [customers, filter, search]);

  const saveNote = async () => {
    const targetBusinessId = businessId || bizId;
    if (!targetBusinessId || !selectedCustomer || !noteText.trim()) return;
    setSavingNote(true);
    setDetailError(null);
    try {
      await addBusinessCustomerNote(targetBusinessId, selectedCustomer.user_id, noteText.trim());
      setNoteText('');
      setDetail(await getBusinessCustomerDetail(targetBusinessId, selectedCustomer.user_id));
    } catch (caught) {
      setDetailError(caught instanceof Error ? caught.message : 'تعذر حفظ الملاحظة.');
    } finally {
      setSavingNote(false);
    }
  };

  const openWhatsapp = async () => {
    const targetBusinessId = businessId || bizId;
    if (!targetBusinessId || !selectedCustomer) return;
    const phone = normalizeWhatsapp(selectedCustomer.phone);
    if (!phone) {
      setDetailError('لا يوجد رقم واتساب صالح لهذا العميل.');
      return;
    }
    try {
      await recordBusinessCustomerCommunication({
        businessId: targetBusinessId,
        customerUserId: selectedCustomer.user_id,
        channel: 'whatsapp',
        communicationType: 'message',
        title: 'تواصل مباشر عبر واتساب',
        deliveryStatus: 'recorded'
      });
      window.location.href = `https://wa.me/${phone}`;
    } catch (caught) {
      setDetailError(caught instanceof Error ? caught.message : 'تعذر تسجيل التواصل.');
    }
  };

  if (selectedCustomer) {
    return (
      <div className="space-y-5 font-arabic text-right" dir="rtl">
        <header className="flex items-start gap-3 border-b border-slate-200 pb-4">
          <button
            onClick={() => {
              setSelectedCustomer(null);
              setDetail(null);
              setDetailError(null);
            }}
            className="mt-0.5 rounded-xl border border-slate-200 bg-white p-2.5 text-slate-700 transition hover:bg-slate-50"
            aria-label="العودة إلى العملاء"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-bold text-slate-950">
                {selectedCustomer.full_name || 'مستخدم سند'}
              </h2>
              <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${stateClasses[selectedCustomer.engagement_state]}`}>
                {stateLabels[selectedCustomer.engagement_state]}
              </span>
            </div>
            <p className="mt-1 font-mono text-[11px] text-slate-500" dir="ltr">
              {toLatinDigits(selectedCustomer.phone || 'رقم الهاتف غير متوفر')}
            </p>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => void openWhatsapp()}
            className="flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-3 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-black"
          >
            <MessageCircle className="h-4 w-4" />
            واتساب
          </button>
          <button
            disabled
            className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-xs font-bold text-slate-400"
            title="سيُفعّل عند اكتمال محرك إشعارات العملاء"
          >
            <Send className="h-4 w-4" />
            إشعار سند قريبًا
          </button>
        </div>

        {detailLoading ? (
          <div className="flex justify-center py-14"><Loader2 className="h-6 w-6 animate-spin text-slate-700" /></div>
        ) : detailError ? (
          <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-xs text-rose-700">{detailError}</div>
        ) : detail ? (
          <div className="space-y-6">
            <section className="grid grid-cols-2 gap-x-5 gap-y-4 border-b border-slate-200 pb-5">
              <div>
                <span className="block text-[9px] font-bold text-slate-400">مرتبط منذ</span>
                <span className="mt-1 block text-xs font-bold text-slate-800">{formatDate(detail.customer.created_at)}</span>
              </div>
              <div>
                <span className="block text-[9px] font-bold text-slate-400">آخر تواصل</span>
                <span className="mt-1 block text-xs font-bold text-slate-800">{formatDate(detail.customer.last_contacted_at)}</span>
              </div>
              <div>
                <span className="block text-[9px] font-bold text-slate-400">مصدر الارتباط</span>
                <span className="mt-1 block text-xs font-bold text-slate-800">{detail.customer.source || 'غير محدد'}</span>
              </div>
              <div>
                <span className="block text-[9px] font-bold text-slate-400">مرات التواصل المسجلة</span>
                <span className="mt-1 block font-mono text-xs font-bold text-slate-800">{toLatinDigits(String(detail.customer.contact_count || 0))}</span>
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <StickyNote className="h-4 w-4 text-slate-600" />
                <h3 className="text-sm font-bold text-slate-900">ملاحظات داخلية</h3>
              </div>
              <div className="flex items-end gap-2">
                <textarea
                  value={noteText}
                  onChange={(event) => setNoteText(event.target.value)}
                  placeholder="أضف ملاحظة لا يراها العميل..."
                  rows={3}
                  maxLength={2000}
                  className="min-h-[82px] flex-1 resize-none rounded-2xl border border-slate-200 bg-white p-3 text-xs outline-none transition focus:border-slate-400"
                />
                <button
                  onClick={() => void saveNote()}
                  disabled={savingNote || !noteText.trim()}
                  className="rounded-2xl bg-slate-900 p-3 text-white disabled:bg-slate-300"
                  aria-label="حفظ الملاحظة"
                >
                  {savingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
              {detail.notes.length === 0 ? (
                <p className="border-t border-slate-100 py-4 text-[11px] text-slate-400">لا توجد ملاحظات داخلية بعد.</p>
              ) : (
                <div className="divide-y divide-slate-100 border-y border-slate-100">
                  {detail.notes.map((note) => (
                    <article key={note.id} className="py-3">
                      <p className="text-xs leading-6 text-slate-700">{note.note_text}</p>
                      <p className="mt-1 text-[9px] text-slate-400">{note.created_by_name || 'إدارة النشاط'} · {formatDate(note.created_at)}</p>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-bold text-slate-900">سجل التواصل</h3>
              {detail.communications.length === 0 ? (
                <p className="border-y border-slate-100 py-5 text-[11px] text-slate-400">لم يُسجل أي تواصل مع العميل بعد.</p>
              ) : (
                <div className="divide-y divide-slate-100 border-y border-slate-100">
                  {detail.communications.map((communication) => (
                    <article key={communication.id} className="flex items-start gap-3 py-3">
                      <div className="mt-0.5 rounded-xl bg-slate-100 p-2 text-slate-600">
                        {communication.channel === 'whatsapp' ? <MessageCircle className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-800">{communication.title || 'تواصل مع العميل'}</p>
                        {communication.body && <p className="mt-1 text-[11px] leading-5 text-slate-500">{communication.body}</p>}
                        <p className="mt-1 text-[9px] text-slate-400">{formatDate(communication.created_at)}</p>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-5 font-arabic text-right" dir="rtl">
      <header>
        <h2 className="text-lg font-bold text-slate-950">إدارة العملاء</h2>
        <p className="mt-1 text-[11px] text-slate-500">متابعة العملاء والتواصل معهم وتنشيط علاقتهم بالنشاط</p>
      </header>

      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="ابحث بالاسم أو رقم الهاتف"
          className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-10 text-xs outline-none transition focus:border-slate-400"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-label="مسح البحث">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {([
          ['all', 'الكل'],
          ['active', 'النشطون'],
          ['inactive', 'الخاملون'],
          ['new', 'الجدد']
        ] as const).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`shrink-0 rounded-full border px-3 py-2 text-[10px] font-bold transition ${
              filter === value
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-600'
            }`}
          >
            {label} <span className="font-mono">{toLatinDigits(String(counts[value]))}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-14"><Loader2 className="h-6 w-6 animate-spin text-slate-700" /></div>
      ) : error ? (
        <div className="space-y-3 rounded-2xl border border-rose-100 bg-rose-50 p-4 text-center text-xs text-rose-700">
          <p>{error}</p>
          <button onClick={() => void loadCustomers(businessId)} className="font-bold underline">إعادة المحاولة</button>
        </div>
      ) : filteredCustomers.length === 0 ? (
        <div className="border-y border-dashed border-slate-200 py-12 text-center">
          <Users className="mx-auto h-7 w-7 text-slate-300" />
          <p className="mt-3 text-xs text-slate-500">لا توجد نتائج تطابق البحث أو الفلتر.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 border-y border-slate-100">
          {filteredCustomers.map((customer) => (
            <button
              key={customer.id}
              onClick={() => void loadDetail(customer)}
              className="flex w-full items-center gap-3 py-4 text-right transition hover:bg-slate-50/70"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                <User className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-sm font-bold text-slate-900">{customer.full_name || 'مستخدم سند'}</h3>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[8px] font-bold ${stateClasses[customer.engagement_state]}`}>
                    {stateLabels[customer.engagement_state]}
                  </span>
                </div>
                <p className="mt-1 font-mono text-[10px] text-slate-500" dir="ltr">{toLatinDigits(customer.phone || '—')}</p>
                <p className="mt-1 text-[9px] text-slate-400">آخر تواصل: {formatDate(customer.last_contacted_at)}</p>
              </div>
              <ChevronLeft className="h-4 w-4 shrink-0 text-slate-400" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
