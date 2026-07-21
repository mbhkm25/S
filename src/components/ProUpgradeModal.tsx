import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { X, Check, Copy, UploadCloud, Sparkles, Loader2, AlertCircle, CreditCard, CheckCircle2, FileText, Send } from 'lucide-react';
import { toLatinDigits } from '../lib/digits';
import { callSanadAppFunction } from '../lib/sanadFunctions';

interface ProUpgradeModalProps {
  user: any;
  profile?: any;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ProUpgradeModal({ user, profile, onClose, onSuccess }: ProUpgradeModalProps) {
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [paymentOptions, setPaymentOptions] = useState<any>(null);
  const [selectedAccount, setSelectedAccount] = useState<any>(null);
  const [copiedAccountId, setCopiedAccountId] = useState<string | null>(null);

  // Form states
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Response states
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<any | null>(null);
  const [webhookStatus, setWebhookStatus] = useState<'idle' | 'success' | 'failed'>('idle');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const plan = paymentOptions?.plan;
  const planPrice = Number(plan?.price || 0);
  const planCurrency = plan?.currency || 'YER';
  const planDuration = Number(plan?.duration_days || 30);
  const planLimit = Number(plan?.access_limit || 0);
  const formatNumber = (value: number) => new Intl.NumberFormat('en-US').format(value);

  useEffect(() => {
    async function fetchOptions() {
      setLoadingOptions(true);
      setErrorMessage(null);
      try {
        const { data, error } = await supabase.rpc('get_sanad_pro_payment_options');
        if (error) {
          console.warn('SANAD Pro options fetch failed');
          setErrorMessage('تعذر تحميل خيارات الحسابات المالية حالياً. حاول مجدداً.');
        } else if (data) {
          setPaymentOptions(data);
          // Auto-select the first account if available
          const accounts = data.payment_accounts || [];
          if (accounts.length > 0) {
            setSelectedAccount(accounts[0]);
          }
        }
      } catch (err) {
        console.warn('SANAD Pro options fetch failed');
        setErrorMessage('تعذر تحميل خيارات الدفع والاشتراك.');
      } finally {
        setLoadingOptions(false);
      }
    }
    fetchOptions();
  }, []);

  const handleCopy = (accountNumber: string, accountId: string) => {
    navigator.clipboard.writeText(accountNumber);
    setCopiedAccountId(accountId);
    setTimeout(() => {
      setCopiedAccountId(null);
    }, 2000);
  };

  // Drag handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      validateAndSetFile(droppedFile);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (selectedFile: File) => {
    setErrorMessage(null);
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(selectedFile.type)) {
      setErrorMessage('الملف غير مدعوم. يرجى رفع صورة (PNG, JPG, WEBP) أو ملف PDF فقط.');
      return;
    }
    if (selectedFile.size > 10 * 1024 * 1024) { // 10MB limit
      setErrorMessage('حجم الملف كبير جداً. الحد الأقصى للملف هو 10 ميجابايت.');
      return;
    }
    setFile(selectedFile);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount) {
      setErrorMessage('يرجى اختيار حساب إيداع أولاً.');
      return;
    }

    if (!file) {
      setErrorMessage('يرجى رفع صورة أو مستند إشعار الحوالة.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    let uploadedPath: string | null = null;
    const cleanupUpload = async () => {
      if (uploadedPath) await supabase.storage.from('operation-files').remove([uploadedPath]);
      uploadedPath = null;
    };
    try {
      // 1. Upload receipt file to Supabase Storage in 'operation-files' bucket
      const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const timestamp = Date.now();
      const storagePath = `pro-payment-receipts/${user.id}/${timestamp}_${safeFileName}`;
      uploadedPath = storagePath;

      console.log('[SANAD Pro Test Log] selected payment_account_id:', selectedAccount.id);
      console.log('[SANAD Pro Test Log] receipt upload path:', storagePath);

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('operation-files')
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error('[SANAD Pro Test Log] upload result (error):', uploadError);
        throw new Error(`فشل رفع ملف الإشعار المالي: ${uploadError.message || 'يرجى التحقق من صلاحيات مخزن البيانات'}`);
      }

      console.log('[SANAD Pro Test Log] upload result (success):', uploadData);

      // 2. Call create_pro_payment_request RPC to submit the request
      const rpcParams = {
        p_payment_account_id: selectedAccount.id,
        p_transfer_reference: null,
        p_receipt_bucket: 'operation-files',
        p_receipt_path: storagePath,
        p_receipt_mime_type: file.type,
        p_receipt_file_name: file.name,
        p_receipt_file_size: file.size
      };

      console.log('[SANAD Pro Test Log] RPC payload:', rpcParams);

      const { data: result, error: rpcError } = await supabase.rpc('create_pro_payment_request', rpcParams);

      if (rpcError) {
        await cleanupUpload();
        console.error('[SANAD Pro Test Log] RPC result (error):', rpcError);
        // Handle postgres RPC exceptions if any
        if (rpcError.message?.includes('duplicate_transfer_reference')) {
          setErrorMessage('رقم الحوالة مستخدم مسبقاً. تأكد من الرقم أو تواصل مع فريق سند.');
        } else {
          setErrorMessage(`حدث خطأ أثناء إرسال طلب التفعيل في قاعدة البيانات: ${rpcError.message}`);
        }
        return;
      }

      console.log('[SANAD Pro Test Log] RPC result (success):', result);

      if (result) {
        if (result.ok === true) {
          uploadedPath = null;
          // Trigger the intermediate payment gateway function
          let currentWebhookStatus: 'success' | 'failed' = 'success';
          try {
            console.log('[SANAD Pro Test Log] Sending request to triggerProPaymentVerify...');
            await callSanadAppFunction('sanad-v3-app-trigger-pro-payment-verify', {
              payment_request_id: result.payment_request_id,
              source: 'pwa',
              event: 'sanad_pro_payment_submitted'
            });
            currentWebhookStatus = 'success';
          } catch (error) {
            console.error('[SANAD Pro Test Log] triggerProPaymentVerify trigger error:', error);
            currentWebhookStatus = 'failed';
          }

          setWebhookStatus(currentWebhookStatus);

          setSuccessData({
            payment_request_id: result.payment_request_id,
            expected_amount: result.expected_amount,
            expected_currency: result.expected_currency,
            transfer_reference: result.transfer_reference || null
          });
        } else {
          await cleanupUpload();
          console.warn('SANAD Pro payment request failed');
          const reason = result.reason;
          if (reason === 'duplicate_transfer_reference') {
            setErrorMessage('رقم الحوالة مستخدم مسبقاً. تأكد من الرقم أو تواصل مع فريق سند.');
          } else if (reason === 'profile_incomplete') {
            setErrorMessage('أكمل بياناتك الأساسية أولاً قبل طلب تفعيل سند Pro.');
          } else if (reason === 'invalid_payment_account') {
            setErrorMessage('حساب الإيداع المحدد غير متاح حالياً. اختر حساباً آخر.');
          } else {
            setErrorMessage(result.message || 'تعذر إرسال طلب التفعيل الآن. حاول مرة أخرى.');
          }
        }
      } else {
        await cleanupUpload();
        console.warn('SANAD Pro payment request failed');
        setErrorMessage('تعذر إرسال طلب التفعيل الآن. حاول مرة أخرى.');
      }
    } catch (err: any) {
      await cleanupUpload();
      console.warn('SANAD Pro payment request failed');
      setErrorMessage(err.message || 'حدث خطأ غير متوقع أثناء إرسال الطلب.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" id="pro_upgrade_modal_container">
      <div className="bg-slate-50 w-full max-w-lg rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh] animate-scale-up text-right">
        
        {/* Header */}
        <div className="bg-white border-b border-slate-200/60 px-5 py-4 flex items-center justify-between shrink-0">
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-2">
            <div className="text-right">
              <h2 className="text-sm font-bold text-slate-900 font-arabic flex items-center gap-1.5 justify-end">
                <span>تفعيل سند Pro</span>
                <Sparkles className="w-4 h-4 text-emerald-600 animate-pulse" />
              </h2>
              <p className="text-[10px] text-slate-500 font-arabic">فعّل الوصول الموسع إلى تفاصيل العمليات داخل سند</p>
            </div>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Error Message Slot (Sticky and always visible at the top of the modal) */}
        {errorMessage && (
          <div className="px-5 py-3.5 bg-rose-50 border-b border-rose-100 text-rose-800 text-xs flex items-start gap-2 justify-between shrink-0">
            <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-rose-600 shrink-0 mt-0.5 cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
            <div className="flex items-center gap-1.5 text-right font-arabic">
              <span>{errorMessage}</span>
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            </div>
          </div>
        )}

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {!successData ? (
            <div className="space-y-4">
              {/* Plan info card */}
              <div className="bg-[#111111] text-white rounded-3xl p-5 shadow-md relative overflow-hidden">
                <div className="absolute top-0 left-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -translate-x-10 -translate-y-10" />
                <div className="relative z-10 flex items-center justify-between">
                  <div className="bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-emerald-500/20 font-arabic">
                    الخطة الاحترافية
                  </div>
                  <h3 className="text-xs font-bold text-slate-300 font-arabic">باقة سند Pro</h3>
                </div>
                <div className="mt-4 flex items-baseline justify-end gap-1.5 relative z-10">
                  <span className="text-xs text-slate-400 font-arabic">{planCurrency} / {toLatinDigits(planDuration)} يومًا</span>
                  <span className="text-2xl font-bold font-mono">{formatNumber(planPrice)}</span>
                </div>
                <ul className="mt-4 space-y-2 border-t border-white/10 pt-3 text-[10px] text-slate-300 font-arabic">
                  {(plan?.features || []).map((feature: string) => <li key={feature} className="flex items-center gap-1.5 justify-end"><span>{feature}</span><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" /></li>)}
                  <li className="flex items-center gap-1.5 justify-end"><span>{toLatinDigits(planLimit)} عملية خلال مدة الباقة، دون ترحيل المتبقي</span><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" /></li>
                </ul>
              </div>

              {/* Steps overview */}
              <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-medium font-arabic">
                <div className="bg-white p-2.5 rounded-2xl border border-slate-200/60 shadow-sm space-y-1">
                  <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center mx-auto font-bold text-slate-700">1</span>
                  <span className="text-slate-600 block font-semibold">اختر جهة الإيداع</span>
                </div>
                <div className="bg-white p-2.5 rounded-2xl border border-slate-200/60 shadow-sm space-y-1">
                  <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center mx-auto font-bold text-slate-700">2</span>
                  <span className="text-slate-600 block font-semibold">أودع {formatNumber(planPrice)} {planCurrency}</span>
                </div>
                <div className="bg-white p-2.5 rounded-2xl border border-slate-200/60 shadow-sm space-y-1">
                  <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center mx-auto font-bold text-slate-700">3</span>
                  <span className="text-slate-600 block font-semibold">ارفع إشعار الحوالة</span>
                </div>
              </div>

              {/* Step 1: Deposit Accounts list */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-800 font-arabic block">1. اختر حساب الإيداع المناسب لك:</label>
                {loadingOptions ? (
                  <div className="bg-white rounded-3xl border border-slate-200/60 p-6 flex flex-col items-center justify-center space-y-2">
                    <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
                    <span className="text-xs text-slate-400 font-arabic">جاري جلب حسابات الإيداع المتاحة...</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2.5">
                    {paymentOptions?.payment_accounts?.map((acc: any) => {
                      const isSelected = selectedAccount?.id === acc.id;
                      return (
                        <div
                          key={acc.id}
                          onClick={() => setSelectedAccount(acc)}
                          className={`bg-white rounded-2xl p-3.5 border transition-all cursor-pointer text-right flex items-center justify-between gap-3 ${
                            isSelected
                              ? 'border-emerald-600 bg-emerald-50/10 shadow-sm shadow-emerald-500/5'
                              : 'border-slate-200/60 hover:border-slate-300'
                          }`}
                        >
                          {/* Action area: select or copy */}
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopy(acc.account_number, acc.id);
                              }}
                              className="text-[9px] font-bold text-slate-600 hover:text-black bg-slate-50 hover:bg-slate-100 border border-slate-200 py-1.5 px-3 rounded-xl transition-all cursor-pointer flex items-center gap-1"
                            >
                              {copiedAccountId === acc.id ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-600" />
                                  <span className="font-arabic text-emerald-700">تم النسخ</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span className="font-arabic">نسخ الرقم</span>
                                </>
                              )}
                            </button>
                            {isSelected && (
                              <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                                <Check className="w-3.5 h-3.5" />
                              </div>
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 justify-end">
                              <span className="text-xs font-bold text-slate-800 font-arabic">{acc.financial_entity}</span>
                            </div>
                            <div className="flex flex-col items-end mt-1 space-y-0.5 text-[10px]">
                              <div className="flex items-center gap-1 text-slate-700">
                                <span className="font-bold font-mono text-xs">{toLatinDigits(acc.account_number)}</span>
                                <span className="text-slate-400 font-arabic">:رقم الحساب</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Step 2 & 3 Input Form */}
              {selectedAccount && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Step 2 guidelines summary */}
                  <div className="bg-amber-50/55 rounded-2xl p-4 border border-amber-100/40 text-right space-y-1">
                    <p className="text-xs font-bold text-amber-900 font-arabic">2. أودع / حوّل مبلغ الاشتراك:</p>
                    <p className="text-[11px] text-amber-800 leading-relaxed font-arabic">
                      يرجى تحويل مبلغ <span className="font-bold text-slate-900">{formatNumber(planPrice)} {planCurrency}</span> إلى الحساب المختار بالأعلى: <span className="font-bold text-slate-900">{selectedAccount.financial_entity}</span>.
                    </p>
                  </div>

                  {/* Step 3 inputs */}
                  <div className="space-y-3.5 pt-1">
                    <label className="text-xs font-bold text-slate-800 font-arabic block">3. ارفع إشعار الحوالة لطلب الاعتماد:</label>

                    {/* File upload zone */}
                    <div className="space-y-1.5">
                      <span className="text-[11px] text-slate-500 block font-arabic">ملف أو صورة إشعار التحويل:</span>
                      
                      <div
                        onDragEnter={handleDrag}
                        onDragOver={handleDrag}
                        onDragLeave={handleDrag}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all ${
                          dragActive
                            ? 'border-emerald-600 bg-emerald-50/10'
                            : 'border-slate-200 bg-white hover:bg-slate-50/40'
                        }`}
                      >
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleFileChange}
                          accept="image/png,image/jpeg,image/webp,application/pdf"
                          className="hidden"
                        />
                        
                        <div className="flex flex-col items-center">
                          <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 mb-2">
                            <UploadCloud className="w-5 h-5 text-slate-700" />
                          </div>
                          
                          {file ? (
                            <div className="space-y-0.5 text-center min-w-0 max-w-full">
                              <p className="text-xs font-semibold text-emerald-700 font-mono truncate" dir="ltr">{file.name}</p>
                              <p className="text-[9px] text-slate-400 font-mono">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                            </div>
                          ) : (
                            <div className="space-y-0.5">
                              <p className="text-xs font-bold text-slate-700 font-arabic">اسحب وأفلت إشعار الحوالة هنا</p>
                              <p className="text-[9px] text-slate-400 font-arabic">أو اضغط للتصفح (صورة أو PDF حتى 10 ميجابايت)</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Submission buttons */}
                  <div className="pt-2 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={onClose}
                      className="w-1/3 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-xs transition-colors"
                    >
                      إلغاء
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-2/3 py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600/60 text-white font-bold rounded-2xl text-xs transition-all shadow-md shadow-emerald-600/10 hover:shadow-emerald-600/20 active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span className="font-arabic font-bold">جاري رفع الطلب...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          <span className="font-arabic font-bold">إرسال طلب التفعيل</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            /* Success View */
            <div className="py-6 px-4 text-center space-y-6" id="pro_payment_success_view">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 animate-bounce">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-slate-900 font-arabic">تم استلام طلب التفعيل</h3>
                <p className="text-xs text-slate-500 leading-relaxed font-arabic px-2">
                  {webhookStatus === 'failed'
                    ? 'تم استلام طلب التفعيل، لكن تعذر إرسال الطلب للتحقق الآلي. سيتم مراجعته.'
                    : 'تم استلام طلب التفعيل وبدأت معالجته.'}
                </p>
              </div>

              <div className="bg-slate-100 rounded-2xl p-4 text-right space-y-2.5 border border-slate-200/60">
                {successData.transfer_reference && (
                  <div className="flex items-center justify-between text-xs border-b border-slate-200/40 pb-2">
                    <span className="font-mono font-bold text-slate-800">{toLatinDigits(successData.transfer_reference)}</span>
                    <span className="text-slate-500 font-arabic">رقم الحوالة المرجعي:</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs border-b border-slate-200/40 pb-2">
                  <span className="font-bold text-emerald-700 font-mono">{formatNumber(Number(successData.expected_amount))} {successData.expected_currency}</span>
                  <span className="text-slate-500 font-arabic">القيمة المتوقعة:</span>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 block font-arabic text-left">رقم طلب التفعيل:</span>
                  <p className="font-mono text-[10px] text-slate-700 bg-white px-2.5 py-1.5 rounded-xl border border-slate-150 select-all text-center">
                    {successData.payment_request_id}
                  </p>
                </div>
              </div>

              <div className="bg-emerald-50 rounded-2xl p-3.5 border border-emerald-100/40 text-right">
                <p className="text-[10px] text-emerald-800 leading-relaxed font-arabic">
                  <span className="font-bold">ملاحظة:</span> سنرسل لك إشعاراً عبر الواتساب فور اعتماد التفعيل بالكامل. لتسريع عملية التحقق الفوري، يمكنك إرسال رقم طلب التفعيل إلى فريق الدعم.
                </p>
              </div>

              <div className="pt-2 space-y-2.5">
                <button
                  type="button"
                  onClick={() => {
                    onSuccess();
                    onClose();
                  }}
                  className="w-full py-3 bg-[#111111] hover:bg-black text-white font-bold rounded-2xl text-xs transition-colors cursor-pointer"
                >
                  العودة إلى حسابي
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
