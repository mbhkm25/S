import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Loader2,
  PhoneCall,
  Send,
  Sparkles,
  UploadCloud,
  X
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

type PaymentAccount = {
  id: string;
  account_number: string;
  financial_entity: string;
};

type PaymentOptions = {
  plan?: {
    price?: number;
    currency?: string;
    duration_days?: number;
    access_limit?: number;
    features?: string[];
  };
  payment_accounts?: PaymentAccount[];
};

type SuccessData = {
  payment_request_id: string;
  expected_amount: number;
  expected_currency: string;
  transfer_reference?: string | null;
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

export default function ProUpgradeModal({ user, onClose, onSuccess }: ProUpgradeModalProps) {
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [paymentOptions, setPaymentOptions] = useState<PaymentOptions | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<PaymentAccount | null>(null);
  const [copiedAccountId, setCopiedAccountId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<SuccessData | null>(null);
  const [webhookStatus, setWebhookStatus] = useState<'idle' | 'success' | 'failed'>('idle');
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
      if (event.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKeyDown);

    void (async () => {
      setLoadingOptions(true);
      setErrorMessage(null);
      try {
        const [{ data, error }, appInfo] = await Promise.all([
          supabase.rpc('get_sanad_pro_payment_options'),
          getAppPublicInformation().catch(() => null)
        ]);
        if (!active) return;
        if (error) throw error;
        const options = (data || null) as PaymentOptions | null;
        setPaymentOptions(options);
        setSelectedAccount(options?.payment_accounts?.[0] || null);
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
  }, [onClose, submitting]);

  const handleCopy = async (accountNumber: string, accountId: string) => {
    await navigator.clipboard.writeText(accountNumber);
    setCopiedAccountId(accountId);
    window.setTimeout(() => setCopiedAccountId(null), 1800);
  };

  const validateAndSetFile = (selectedFile: File) => {
    setErrorMessage(null);
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(selectedFile.type)) {
      setErrorMessage('الملف غير مدعوم. ارفع صورة PNG أو JPG أو WEBP أو ملف PDF.');
      return;
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      setErrorMessage('حجم الملف يتجاوز الحد الأقصى وهو 10 ميجابايت.');
      return;
    }
    setFile(selectedFile);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedAccount) return setErrorMessage('اختر حساب إيداع أولًا.');
    if (!file) return setErrorMessage('ارفع صورة أو مستند إشعار الحوالة.');

    setSubmitting(true);
    setErrorMessage(null);
    let uploadedPath: string | null = null;

    try {
      const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      uploadedPath = `pro-payment-receipts/${user.id}/${Date.now()}_${safeFileName}`;
      const { error: uploadError } = await supabase.storage
        .from('operation-files')
        .upload(uploadedPath, file, { cacheControl: '3600', upsert: false });
      if (uploadError) throw new Error('تعذر رفع إشعار الحوالة.');

      const { data, error } = await supabase.rpc('create_pro_payment_request', {
        p_payment_account_id: selectedAccount.id,
        p_transfer_reference: null,
        p_receipt_bucket: 'operation-files',
        p_receipt_path: uploadedPath,
        p_receipt_mime_type: file.type,
        p_receipt_file_name: file.name,
        p_receipt_file_size: file.size
      });
      if (error || !data?.ok) {
        await supabase.storage.from('operation-files').remove([uploadedPath]);
        uploadedPath = null;
        const reason = data?.reason || error?.message || '';
        if (String(reason).includes('duplicate_transfer_reference')) {
          throw new Error('رقم الحوالة مستخدم مسبقًا.');
        }
        if (String(reason).includes('profile_incomplete')) {
          throw new Error('أكمل بياناتك الأساسية قبل طلب التفعيل.');
        }
        if (String(reason).includes('invalid_payment_account')) {
          throw new Error('حساب الإيداع المحدد غير متاح حاليًا.');
        }
        throw new Error(data?.message || 'تعذر إرسال طلب التفعيل الآن.');
      }

      uploadedPath = null;
      let nextWebhookStatus: 'success' | 'failed' = 'success';
      try {
        await callSanadAppFunction('sanad-v3-app-trigger-pro-payment-verify', {
          payment_request_id: data.payment_request_id,
          source: 'pwa',
          event: 'sanad_pro_payment_submitted'
        });
      } catch {
        nextWebhookStatus = 'failed';
      }
      setWebhookStatus(nextWebhookStatus);
      setSuccessData({
        payment_request_id: data.payment_request_id,
        expected_amount: Number(data.expected_amount || planPrice),
        expected_currency: data.expected_currency || planCurrency,
        transfer_reference: data.transfer_reference || null
      });
    } catch (error) {
      if (uploadedPath) await supabase.storage.from('operation-files').remove([uploadedPath]);
      setErrorMessage(error instanceof Error ? error.message : 'حدث خطأ غير متوقع أثناء إرسال الطلب.');
    } finally {
      setSubmitting(false);
    }
  };

  const portal = (
    <div
      id="pro_upgrade_modal_container"
      className="fixed inset-0 z-[2147483000] isolate flex h-[100dvh] w-screen items-end justify-center overflow-hidden bg-slate-950/70 backdrop-blur-md sm:items-center sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pro-upgrade-title"
      dir="rtl"
    >
      <button
        type="button"
        aria-label="إغلاق نافذة تفعيل سند Pro"
        className="absolute inset-0 cursor-default"
        onClick={() => { if (!submitting) onClose(); }}
      />

      <section className="relative z-10 flex h-[100dvh] w-full max-w-2xl flex-col overflow-hidden bg-slate-50 text-right shadow-2xl sm:h-auto sm:max-h-[min(92dvh,900px)] sm:rounded-[2rem] sm:border sm:border-white/70">
        <header className="shrink-0 border-b border-slate-200/70 bg-white/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl sm:px-6 sm:py-4">
          <div className="flex min-h-12 items-center justify-between gap-3">
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-900 disabled:opacity-40"
              aria-label="إغلاق"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
              <div className="min-w-0">
                <h2 id="pro-upgrade-title" className="flex items-center justify-end gap-1.5 text-base font-black text-slate-950">
                  <span>تفعيل سند Pro</span>
                  <Sparkles className="h-4 w-4 text-emerald-600" />
                </h2>
                <p className="mt-1 text-[11px] leading-5 text-slate-500">الوصول الموسع إلى تفاصيل العمليات داخل سند</p>
              </div>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <CreditCard className="h-5 w-5" />
              </span>
            </div>
          </div>
        </header>

        {errorMessage ? (
          <div className="shrink-0 border-b border-rose-100 bg-rose-50 px-4 py-3 text-xs text-rose-800 sm:px-6">
            <div className="flex items-start justify-between gap-3">
              <button type="button" onClick={() => setErrorMessage(null)} className="mt-0.5 text-rose-400" aria-label="إخفاء الخطأ"><X className="h-4 w-4" /></button>
              <span className="flex flex-1 items-start justify-end gap-2 leading-6"><span>{errorMessage}</span><AlertCircle className="mt-1 h-4 w-4 shrink-0 text-rose-500" /></span>
            </div>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 [scrollbar-gutter:stable] sm:px-6 sm:py-5">
          {!successData ? (
            <form onSubmit={handleSubmit} className="mx-auto w-full max-w-xl space-y-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              <section className="relative overflow-hidden rounded-[1.75rem] bg-slate-950 p-5 text-white shadow-xl">
                <div className="absolute -left-12 -top-12 h-40 w-40 rounded-full bg-emerald-400/10 blur-3xl" />
                <div className="relative flex items-center justify-between gap-3">
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-bold text-emerald-300">الخطة الاحترافية</span>
                  <strong className="text-sm text-slate-200">باقة سند Pro</strong>
                </div>
                <div className="relative mt-5 flex items-end justify-end gap-2">
                  <span className="pb-1 text-xs text-slate-400">{planCurrency} / {toLatinDigits(planDuration)} يومًا</span>
                  <strong className="font-mono text-4xl tracking-tight">{formatNumber(planPrice)}</strong>
                </div>
                <div className="relative mt-5 grid gap-2 border-t border-white/10 pt-4 text-[11px] leading-5 text-slate-300 sm:grid-cols-2">
                  {(plan?.features || []).map((feature) => <span key={feature} className="flex items-start justify-end gap-2"><span>{feature}</span><i className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" /></span>)}
                  <span className="flex items-start justify-end gap-2"><span>{toLatinDigits(planLimit)} عملية خلال مدة الباقة دون ترحيل المتبقي</span><i className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" /></span>
                </div>
              </section>

              <section className="grid grid-cols-3 gap-2 text-center text-[10px] font-bold text-slate-600">
                {['اختر جهة الإيداع', `أودع ${formatNumber(planPrice)} ${planCurrency}`, 'ارفع إشعار الحوالة'].map((label, index) => (
                  <div key={label} className="rounded-2xl border border-slate-200 bg-white px-2 py-3 shadow-sm"><span className="mx-auto mb-2 flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-800">{index + 1}</span>{label}</div>
                ))}
              </section>

              <section className="space-y-2.5">
                <h3 className="text-sm font-black text-slate-900">1. اختر حساب الإيداع المناسب:</h3>
                {loadingOptions ? (
                  <div className="flex min-h-28 items-center justify-center gap-2 rounded-3xl border border-slate-200 bg-white text-xs text-slate-500"><Loader2 className="h-5 w-5 animate-spin text-emerald-600" />جاري تحميل الحسابات...</div>
                ) : (
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {(paymentOptions?.payment_accounts || []).map((account) => {
                      const selected = selectedAccount?.id === account.id;
                      return (
                        <article key={account.id} onClick={() => setSelectedAccount(account)} className={`flex min-h-[88px] cursor-pointer items-center justify-between gap-3 rounded-2xl border bg-white p-3.5 transition ${selected ? 'border-emerald-500 ring-2 ring-emerald-100' : 'border-slate-200 hover:border-slate-300'}`}>
                          <div className="flex shrink-0 items-center gap-2">
                            <button type="button" onClick={(event) => { event.stopPropagation(); void handleCopy(account.account_number, account.id); }} className="flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-[10px] font-bold text-slate-600">
                              {copiedAccountId === account.id ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                              {copiedAccountId === account.id ? 'تم النسخ' : 'نسخ الرقم'}
                            </button>
                            {selected ? <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check className="h-4 w-4" /></span> : null}
                          </div>
                          <div className="min-w-0 text-right"><strong className="block text-sm text-slate-900">{account.financial_entity}</strong><span className="mt-1 block font-mono text-sm font-bold text-slate-700" dir="ltr">{toLatinDigits(account.account_number)}</span></div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              {selectedAccount ? (
                <>
                  <section className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-900">
                    <strong className="block">2. حوّل مبلغ الاشتراك</strong>
                    حوّل <b>{formatNumber(planPrice)} {planCurrency}</b> إلى حساب <b>{selectedAccount.financial_entity}</b> المختار أعلاه.
                  </section>

                  <section className="space-y-2.5">
                    <h3 className="text-sm font-black text-slate-900">3. ارفع إشعار الحوالة:</h3>
                    <div
                      onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
                      onDragOver={(event) => event.preventDefault()}
                      onDragLeave={(event) => { event.preventDefault(); setDragActive(false); }}
                      onDrop={(event) => { event.preventDefault(); setDragActive(false); const dropped = event.dataTransfer.files?.[0]; if (dropped) validateAndSetFile(dropped); }}
                      onClick={() => fileInputRef.current?.click()}
                      className={`flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed px-5 py-6 text-center transition ${dragActive ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                    >
                      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="hidden" onChange={(event) => { const selected = event.target.files?.[0]; if (selected) validateAndSetFile(selected); }} />
                      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-700"><UploadCloud className="h-6 w-6" /></span>
                      {file ? <><strong className="max-w-full truncate text-sm text-emerald-700" dir="ltr">{file.name}</strong><span className="mt-1 text-[10px] text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</span></> : <><strong className="text-sm text-slate-800">اضغط لاختيار صورة أو PDF</strong><span className="mt-1 text-[11px] text-slate-400">الحد الأقصى 10 ميجابايت</span></>}
                    </div>
                  </section>

                  <div className="sticky bottom-0 -mx-4 flex gap-3 border-t border-slate-200/80 bg-slate-50/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
                    <button type="button" onClick={onClose} disabled={submitting} className="min-h-13 w-1/3 rounded-2xl bg-slate-200 text-sm font-bold text-slate-700 disabled:opacity-50">إلغاء</button>
                    <button type="submit" disabled={submitting} className="flex min-h-13 w-2/3 items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-sm font-black text-white shadow-lg shadow-emerald-600/20 disabled:opacity-60">
                      {submitting ? <><Loader2 className="h-5 w-5 animate-spin" />جاري رفع الطلب...</> : <><Send className="h-5 w-5" />إرسال طلب التفعيل</>}
                    </button>
                  </div>
                </>
              ) : null}
            </form>
          ) : (
            <section className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center space-y-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center">
              <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-10 w-10" /></span>
              <div><h3 className="text-xl font-black text-slate-950">تم استلام طلب التفعيل</h3><p className="mt-2 text-sm leading-7 text-slate-500">{webhookStatus === 'failed' ? 'تم استلام الطلب وسيتم مراجعته، لكن تعذر تشغيل التحقق الآلي فورًا.' : 'تم استلام الطلب وبدأت معالجته.'}</p></div>
              <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4 text-right text-xs">
                {successData.transfer_reference ? <p className="flex justify-between gap-3"><b dir="ltr">{toLatinDigits(successData.transfer_reference)}</b><span className="text-slate-500">المرجع:</span></p> : null}
                <p className="flex justify-between gap-3"><b className="text-emerald-700">{formatNumber(successData.expected_amount)} {successData.expected_currency}</b><span className="text-slate-500">القيمة المتوقعة:</span></p>
                <p className="break-all rounded-xl bg-slate-50 p-2 text-center font-mono text-[10px]" dir="ltr">{successData.payment_request_id}</p>
              </div>
              <div className="space-y-2.5">
                {supportWhatsapp ? <a href={`https://wa.me/${supportWhatsapp}?text=${encodeURIComponent(`أريد متابعة طلب تفعيل سند Pro رقم ${successData.payment_request_id}`)}`} target="_blank" rel="noopener noreferrer" className="flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] text-sm font-black text-white"><PhoneCall className="h-5 w-5" />متابعة الطلب عبر واتساب</a> : null}
                <button type="button" onClick={() => { onSuccess(); onClose(); }} className="min-h-13 w-full rounded-2xl bg-slate-950 text-sm font-black text-white">العودة إلى حسابي</button>
              </div>
            </section>
          )}
        </div>
      </section>
    </div>
  );

  return createPortal(portal, document.body);
}
