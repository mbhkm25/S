import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle, Check, CheckCircle2, Copy, CreditCard, FileCheck2,
  Loader2, PhoneCall, Send, ShieldCheck, Sparkles, UploadCloud, X
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { toLatinDigits } from '../lib/digits';
import { callSanadAppFunction } from '../lib/sanadFunctions';
import { getAppPublicInformation } from '../lib/appPublicInformation';

interface ProUpgradeModalProps {
  user: { id: string };
  profile?: unknown;
  onClose: () => void;
  onSuccess: () => void;
}

type PaymentAccount = { id: string; account_number: string; financial_entity: string };
type PaymentOptions = {
  plan?: { price?: number; currency?: string; duration_days?: number; access_limit?: number; features?: string[] };
  payment_accounts?: PaymentAccount[];
};
type SuccessData = { payment_request_id: string; expected_amount: number; expected_currency: string };
type View = 'form' | 'confirm' | 'success';

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}
async function fileSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export default function ProUpgradeModal({ user, onClose, onSuccess }: ProUpgradeModalProps) {
  const [view, setView] = useState<View>('form');
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [paymentOptions, setPaymentOptions] = useState<PaymentOptions | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<PaymentAccount | null>(null);
  const [copiedAccountId, setCopiedAccountId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<SuccessData | null>(null);
  const [supportWhatsapp, setSupportWhatsapp] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const plan = paymentOptions?.plan;
  const planPrice = Number(plan?.price || 0);
  const planCurrency = plan?.currency || 'YER';
  const planDuration = Number(plan?.duration_days || 30);
  const planLimit = Number(plan?.access_limit || 0);

  useEffect(() => {
    let active = true;
    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;
    const scrollY = window.scrollY;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) {
        if (view === 'confirm') setView('form');
        else onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    void (async () => {
      try {
        const [{ data, error }, appInfo] = await Promise.all([
          supabase.rpc('get_sanad_pro_payment_options'),
          getAppPublicInformation().catch(() => null)
        ]);
        if (!active) return;
        if (error) throw error;
        setPaymentOptions((data || null) as PaymentOptions | null);
        setSelectedAccount(null);
        setSupportWhatsapp(appInfo?.support_whatsapp?.replace(/\D/g, '') || null);
      } catch {
        if (active) setErrorMessage('تعذر تحميل خيارات الدفع والاشتراك. حاول مرة أخرى.');
      } finally {
        if (active) setLoadingOptions(false);
      }
    })();

    return () => {
      active = false;
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
      window.scrollTo({ top: scrollY, behavior: 'auto' });
    };
  }, [onClose, submitting, view]);

  const copyAccount = async (account: PaymentAccount) => {
    await navigator.clipboard.writeText(account.account_number);
    setCopiedAccountId(account.id);
    window.setTimeout(() => setCopiedAccountId(null), 1600);
  };

  const chooseFile = (next: File) => {
    setErrorMessage(null);
    if (!['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(next.type)) {
      setErrorMessage('الملف غير مدعوم. ارفع صورة PNG أو JPG أو WEBP أو ملف PDF.');
      return;
    }
    if (next.size > 10 * 1024 * 1024) {
      setErrorMessage('حجم الملف يتجاوز 10 ميجابايت.');
      return;
    }
    setFile(next);
  };

  const openConfirmation = (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    if (!selectedAccount) return setErrorMessage('اختر حساب الإيداع الذي حوّلت إليه فعلًا.');
    if (!file) return setErrorMessage('ارفع إشعار الحوالة أولًا.');
    setView('confirm');
  };

  const submitConfirmedRequest = async () => {
    if (!selectedAccount || !file || submitting) return;
    setSubmitting(true);
    setErrorMessage(null);
    let uploadedPath: string | null = null;
    try {
      const receiptSha256 = await fileSha256(file);
      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      uploadedPath = `pro-payment-receipts/${user.id}/${Date.now()}_${safeName}`;
      const { error: uploadError } = await supabase.storage.from('operation-files').upload(uploadedPath, file, {
        cacheControl: '3600', upsert: false
      });
      if (uploadError) throw new Error('تعذر رفع إشعار الحوالة.');

      const { data, error } = await supabase.rpc('create_pro_payment_request', {
        p_payment_account_id: selectedAccount.id,
        p_transfer_reference: null,
        p_receipt_bucket: 'operation-files',
        p_receipt_path: uploadedPath,
        p_receipt_mime_type: file.type,
        p_receipt_file_name: file.name,
        p_receipt_file_size: file.size,
        p_receipt_sha256: receiptSha256
      });
      if (error || !data?.ok) {
        await supabase.storage.from('operation-files').remove([uploadedPath]);
        uploadedPath = null;
        const reason = String(data?.reason || error?.message || '');
        if (reason.includes('duplicate_receipt')) {
          throw new Error('هذا الإشعار استُخدم في طلب تفعيل سابق، ولا يمكن استخدام الإشعار نفسه لأكثر من اشتراك.');
        }
        if (reason.includes('invalid_receipt_fingerprint')) throw new Error('تعذر التحقق من سلامة ملف الإشعار. أعد اختياره.');
        if (reason.includes('profile_incomplete')) throw new Error('أكمل بياناتك الأساسية قبل طلب التفعيل.');
        if (reason.includes('invalid_payment_account')) throw new Error('حساب الإيداع المحدد غير متاح حاليًا.');
        throw new Error(data?.message || 'تعذر إرسال طلب التفعيل الآن.');
      }

      uploadedPath = null;
      setSuccessData({
        payment_request_id: data.payment_request_id,
        expected_amount: Number(data.expected_amount || planPrice),
        expected_currency: data.expected_currency || planCurrency
      });
      setView('success');
      try {
        await callSanadAppFunction('sanad-v3-app-trigger-pro-payment-verify', {
          payment_request_id: data.payment_request_id,
          source: 'pwa',
          event: 'sanad_pro_payment_submitted'
        });
      } catch {
        setErrorMessage('تم استلام الطلب، لكن تعذر بدء التحقق الآلي فورًا. سيتم إشعارك عبر واتساب بعد المراجعة.');
      }
    } catch (error) {
      if (uploadedPath) await supabase.storage.from('operation-files').remove([uploadedPath]);
      setView('form');
      setErrorMessage(error instanceof Error ? error.message : 'حدث خطأ غير متوقع أثناء إرسال الطلب.');
    } finally {
      setSubmitting(false);
    }
  };

  const accountCard = (account: PaymentAccount) => {
    const selected = selectedAccount?.id === account.id;
    return (
      <article key={account.id} onClick={() => setSelectedAccount(account)}
        className={`flex min-h-[88px] cursor-pointer items-center justify-between gap-3 rounded-2xl border bg-white p-3.5 transition ${selected ? 'border-emerald-500 ring-2 ring-emerald-100' : 'border-slate-200 hover:border-slate-300'}`}>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={(event) => { event.stopPropagation(); void copyAccount(account); }}
            className="flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-[10px] font-bold text-slate-600">
            {copiedAccountId === account.id ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copiedAccountId === account.id ? 'تم النسخ' : 'نسخ الرقم'}
          </button>
          {selected ? <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check className="h-4 w-4" /></span> : null}
        </div>
        <div className="min-w-0 text-right">
          <strong className="block text-sm text-slate-900">{account.financial_entity}</strong>
          <span className="mt-1 block font-mono text-sm font-bold text-slate-700" dir="ltr">{toLatinDigits(account.account_number)}</span>
        </div>
      </article>
    );
  };

  const portal = (
    <div className="fixed inset-0 z-[2147483000] isolate flex h-[100dvh] w-screen items-end justify-center overflow-hidden bg-slate-950/70 backdrop-blur-md sm:items-center sm:p-5" role="dialog" aria-modal="true" dir="rtl">
      <button type="button" aria-label="إغلاق" className="absolute inset-0" onClick={() => { if (!submitting) onClose(); }} />
      <section className="relative z-10 flex h-[100dvh] w-full max-w-2xl flex-col overflow-hidden bg-slate-50 text-right shadow-2xl sm:h-auto sm:max-h-[min(92dvh,900px)] sm:rounded-[2rem] sm:border sm:border-white/70">
        <header className="shrink-0 border-b border-slate-200 bg-white/95 px-4 pb-3 pt-[max(.75rem,env(safe-area-inset-top))] backdrop-blur-xl sm:px-6 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <button ref={closeButtonRef} type="button" disabled={submitting} onClick={() => view === 'confirm' ? setView('form') : onClose()}
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 disabled:opacity-40" aria-label={view === 'confirm' ? 'العودة' : 'إغلاق'}>
              <X className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-3">
              <div><h2 className="flex items-center justify-end gap-1.5 text-lg font-black text-slate-950"><span>تفعيل سند Pro</span><Sparkles className="h-4 w-4 text-emerald-600" /></h2><p className="mt-1 text-[11px] text-slate-500">تحقق آلي آمن من إشعار الدفع</p></div>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><CreditCard className="h-6 w-6" /></span>
            </div>
          </div>
        </header>

        {errorMessage ? <div className="shrink-0 border-b border-rose-100 bg-rose-50 px-4 py-3 text-xs leading-6 text-rose-800"><span className="flex items-start justify-end gap-2"><span>{errorMessage}</span><AlertCircle className="mt-1 h-4 w-4 shrink-0" /></span></div> : null}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
          {view === 'form' ? (
            <form onSubmit={openConfirmation} className="mx-auto w-full max-w-xl space-y-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              <section className="rounded-[1.75rem] bg-slate-950 p-5 text-white shadow-xl">
                <div className="flex items-center justify-between"><span className="rounded-full bg-emerald-400/10 px-3 py-1 text-[10px] font-bold text-emerald-300">الخطة الاحترافية</span><strong>باقة سند Pro</strong></div>
                <div className="mt-5 flex items-end justify-end gap-2"><span className="pb-1 text-xs text-slate-400">{planCurrency} / {toLatinDigits(planDuration)} يومًا</span><strong className="font-mono text-4xl">{formatNumber(planPrice)}</strong></div>
                <div className="mt-5 grid gap-2 border-t border-white/10 pt-4 text-[11px] text-slate-300 sm:grid-cols-2">
                  {(plan?.features || []).map(feature => <span key={feature} className="flex items-start justify-end gap-2"><span>{feature}</span><i className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400" /></span>)}
                  <span className="flex items-start justify-end gap-2"><span>{toLatinDigits(planLimit)} عملية خلال مدة الباقة</span><i className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400" /></span>
                </div>
              </section>

              <section className="space-y-2.5">
                <h3 className="text-sm font-black">1. اختر الحساب الذي حوّلت إليه فعلًا:</h3>
                <p className="text-[11px] leading-5 text-slate-500">لا يتم تحديد حساب افتراضيًا. اختيار الحساب جزء من التحقق الأمني.</p>
                {loadingOptions ? <div className="flex min-h-28 items-center justify-center gap-2 rounded-3xl bg-white text-xs text-slate-500"><Loader2 className="h-5 w-5 animate-spin" />جاري تحميل الحسابات...</div> : <div className="grid gap-2.5 sm:grid-cols-2">{(paymentOptions?.payment_accounts || []).map(accountCard)}</div>}
              </section>

              <section className="space-y-2.5">
                <h3 className="text-sm font-black">2. ارفع إشعار الحوالة:</h3>
                <button type="button" onClick={() => fileInputRef.current?.click()} className="flex min-h-36 w-full flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-white px-5 py-6 text-center">
                  <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="hidden" onChange={event => { const selected = event.target.files?.[0]; if (selected) chooseFile(selected); }} />
                  <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100"><UploadCloud className="h-6 w-6" /></span>
                  {file ? <><strong className="max-w-full truncate text-sm text-emerald-700" dir="ltr">{file.name}</strong><span className="mt-1 text-[10px] text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</span></> : <><strong className="text-sm">اضغط لاختيار صورة أو PDF</strong><span className="mt-1 text-[11px] text-slate-400">سيتم إنشاء بصمة رقمية لمنع تكرار الإشعار</span></>}
                </button>
              </section>

              <div className="sticky bottom-0 -mx-4 flex gap-3 border-t border-slate-200 bg-slate-50/95 px-4 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
                <button type="button" onClick={onClose} className="min-h-13 w-1/3 rounded-2xl bg-slate-200 text-sm font-bold">إلغاء</button>
                <button type="submit" className="flex min-h-13 w-2/3 items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-sm font-black text-white"><ShieldCheck className="h-5 w-5" />مراجعة وتأكيد الطلب</button>
              </div>
            </form>
          ) : null}

          {view === 'confirm' && selectedAccount && file ? (
            <section className="mx-auto w-full max-w-lg space-y-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              <div className="text-center"><span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><FileCheck2 className="h-10 w-10" /></span><h3 className="mt-4 text-xl font-black">تأكيد بيانات طلب التفعيل</h3><p className="mt-2 text-xs leading-6 text-slate-500">راجع البيانات بعناية. سيطابق Gemini الإشعار مع الحساب المحدد ولن يقبل إشعارًا مستخدمًا سابقًا.</p></div>
              <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3"><b>{formatNumber(planPrice)} {planCurrency}</b><span className="text-xs text-slate-500">مبلغ الاشتراك</span></div>
                <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3"><div className="text-left"><b className="block">{selectedAccount.financial_entity}</b><span className="font-mono text-xs" dir="ltr">{toLatinDigits(selectedAccount.account_number)}</span></div><span className="text-xs text-slate-500">حساب الاستلام</span></div>
                <div className="flex items-center justify-between gap-4"><b className="max-w-[65%] truncate text-xs" dir="ltr">{file.name}</b><span className="text-xs text-slate-500">الإشعار المرفوع</span></div>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-900"><strong className="block">إقرار قبل الإرسال</strong>أؤكد أن الحوالة أُرسلت إلى الحساب الموضح أعلاه، وأن هذا الإشعار لم يُستخدم لتفعيل اشتراك آخر.</div>
              <div className="flex gap-3">
                <button type="button" disabled={submitting} onClick={() => setView('form')} className="min-h-13 w-1/3 rounded-2xl bg-slate-200 text-sm font-bold disabled:opacity-50">تعديل</button>
                <button type="button" disabled={submitting} onClick={() => void submitConfirmedRequest()} className="flex min-h-13 w-2/3 items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-sm font-black text-white disabled:opacity-60">{submitting ? <><Loader2 className="h-5 w-5 animate-spin" />جاري التحقق والإرسال...</> : <><Send className="h-5 w-5" />تأكيد وإرسال الطلب</>}</button>
              </div>
            </section>
          ) : null}

          {view === 'success' && successData ? (
            <section className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center space-y-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center">
              <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-10 w-10" /></span>
              <div><h3 className="text-xl font-black">تم استلام طلب التفعيل</h3><p className="mt-2 text-sm leading-7 text-slate-500">بدأ التحقق الآلي من الحساب والمبلغ والمرجع والتاريخ ومن عدم استخدام الإشعار سابقًا. ستصلك النتيجة أو سبب المراجعة عبر واتساب.</p></div>
              <div className="rounded-3xl border border-slate-200 bg-white p-4 text-xs"><p className="flex justify-between"><b className="text-emerald-700">{formatNumber(successData.expected_amount)} {successData.expected_currency}</b><span className="text-slate-500">القيمة المتوقعة</span></p><p className="mt-3 break-all rounded-xl bg-slate-50 p-2 font-mono text-[10px]" dir="ltr">{successData.payment_request_id}</p></div>
              {supportWhatsapp ? <a href={`https://wa.me/${supportWhatsapp}?text=${encodeURIComponent(`أريد متابعة طلب تفعيل سند Pro رقم ${successData.payment_request_id}`)}`} target="_blank" rel="noopener noreferrer" className="flex min-h-13 items-center justify-center gap-2 rounded-2xl bg-[#25D366] text-sm font-black text-white"><PhoneCall className="h-5 w-5" />متابعة الطلب عبر واتساب</a> : null}
              <button type="button" onClick={() => { onSuccess(); onClose(); }} className="min-h-13 rounded-2xl bg-slate-950 text-sm font-black text-white">العودة إلى حسابي</button>
            </section>
          ) : null}
        </div>
      </section>
    </div>
  );

  return createPortal(portal, document.body);
}
