import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Copy, Crown, Loader2, UploadCloud, Users, X } from 'lucide-react';
import {
  createTeamProPaymentRequest,
  getBusinessTeamProPurchaseOptions,
  type TeamProPurchaseOptions
} from '../../lib/businessTeamApi';
import { callSanadAppFunction } from '../../lib/sanadFunctions';
import { supabase } from '../../lib/supabase';
import { toLatinDigits } from '../../lib/digits';

interface Props {
  businessId: string;
  defaultMemberUserId?: string | null;
  onClose: () => void;
  onSubmitted: () => void;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ar-YE-u-nu-latn', {
    dateStyle: 'medium',
    timeZone: 'Asia/Aden',
    numberingSystem: 'latn'
  }).format(date);
}

const REASON_MESSAGES: Record<string, string> = {
  profile_incomplete: 'أكمل بيانات حسابك الأساسية أولًا.',
  invalid_beneficiary_count: 'اختر عضوًا واحدًا على الأقل.',
  invalid_or_inactive_team_member: 'تتضمن القائمة عضوًا غير نشط. حدّث الفريق ثم أعد المحاولة.',
  invalid_payment_account: 'حساب الإيداع المحدد غير متاح حاليًا.',
  invalid_receipt_path: 'تعذر اعتماد مسار ملف الإشعار.',
  plan_unavailable: 'باقة سند Pro غير متاحة حاليًا.'
};

export default function BusinessTeamProPurchase({
  businessId,
  defaultMemberUserId,
  onClose,
  onSubmitted
}: Props) {
  const [options, setOptions] = useState<TeamProPurchaseOptions | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>(defaultMemberUserId ? [defaultMemberUserId] : []);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    requestId: string;
    count: number;
    total: number;
    currency: string;
  } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getBusinessTeamProPurchaseOptions(businessId)
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) throw new Error(REASON_MESSAGES[result.reason || ''] || 'تعذر تحميل خيارات الاشتراك.');
        setOptions(result);
        setSelectedAccountId(result.payment_accounts[0]?.id || '');
        setSelectedIds((current) => {
          const eligible = new Set(result.members.map((member) => member.user_id));
          const kept = current.filter((id) => eligible.has(id));
          return kept.length ? kept : [];
        });
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'تعذر تحميل خيارات الاشتراك.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  const plan = options?.plan;
  const unitAmount = Number(plan?.unit_amount || 0);
  const total = unitAmount * selectedIds.length;
  const selectedAccount = options?.payment_accounts.find((account) => account.id === selectedAccountId) || null;

  const selectedMembers = useMemo(
    () => options?.members.filter((member) => selectedIds.includes(member.user_id)) || [],
    [options, selectedIds]
  );

  const toggleMember = (userId: string) => {
    setSelectedIds((current) => current.includes(userId)
      ? current.filter((id) => id !== userId)
      : [...current, userId]);
  };

  const selectAll = () => {
    if (!options) return;
    setSelectedIds((current) => current.length === options.members.length
      ? []
      : options.members.map((member) => member.user_id));
  };

  const chooseFile = (selectedFile?: File) => {
    if (!selectedFile) return;
    setError(null);
    if (!['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(selectedFile.type)) {
      setError('ارفع صورة PNG أو JPG أو WEBP أو ملف PDF فقط.');
      return;
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('الحد الأقصى لحجم الإشعار هو 10 MB.');
      return;
    }
    setFile(selectedFile);
  };

  const submit = async () => {
    if (!options || !plan) return;
    if (!selectedIds.length) {
      setError('اختر عضوًا واحدًا على الأقل.');
      return;
    }
    if (!selectedAccountId) {
      setError('اختر حساب الإيداع.');
      return;
    }
    if (!file) {
      setError('أرفق إشعار الحوالة بالمبلغ الإجمالي.');
      return;
    }

    setSubmitting(true);
    setError(null);
    let uploadedPath: string | null = null;
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error('انتهت جلسة الدخول. أعد تسجيل الدخول ثم حاول مجددًا.');

      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      uploadedPath = `pro-payment-receipts/${authData.user.id}/${Date.now()}_team_${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from('operation-files')
        .upload(uploadedPath, file, { cacheControl: '3600', upsert: false });
      if (uploadError) throw new Error(uploadError.message || 'تعذر رفع إشعار الحوالة.');

      const result = await createTeamProPaymentRequest({
        businessId,
        beneficiaryUserIds: selectedIds,
        paymentAccountId: selectedAccountId,
        receiptBucket: 'operation-files',
        receiptPath: uploadedPath,
        receiptMimeType: file.type,
        receiptFileName: file.name,
        receiptFileSize: file.size
      });
      if (!result.ok || !result.payment_request_id) {
        throw new Error(REASON_MESSAGES[result.reason || ''] || 'تعذر إنشاء طلب التفعيل.');
      }

      const requestId = result.payment_request_id;
      uploadedPath = null;
      try {
        await callSanadAppFunction('sanad-v3-app-trigger-pro-payment-verify', {
          payment_request_id: requestId,
          source: 'business_team',
          event: 'sanad_pro_team_payment_submitted'
        });
      } catch {
        // The persisted request remains available to the platform admin for manual review.
      }

      setSuccess({
        requestId,
        count: Number(result.beneficiary_count || selectedIds.length),
        total: Number(result.expected_amount || total),
        currency: result.expected_currency || plan.currency
      });
      onSubmitted();
    } catch (caught) {
      if (uploadedPath) {
        await supabase.storage.from('operation-files').remove([uploadedPath]);
      }
      setError(caught instanceof Error ? caught.message : 'تعذر إرسال الطلب.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] overflow-y-auto bg-slate-950/65 p-0 font-arabic sm:p-4" dir="rtl">
      <div className="mx-auto min-h-full w-full max-w-2xl bg-slate-50 sm:min-h-0 sm:rounded-[28px] sm:shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:rounded-t-[28px]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <Crown className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-950">تفعيل سند Pro لفريق العمل</h2>
              <p className="mt-1 text-[10px] text-slate-500">طلب واحد، وإشعار مالي واحد، وتفعيل مستقل لكل عضو</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-xl border border-slate-200 p-2.5"><X className="h-4 w-4" /></button>
        </header>

        <main className="space-y-4 p-4 pb-[calc(24px+env(safe-area-inset-bottom))]">
          {error && (
            <div className="flex items-start gap-2 rounded-2xl border border-rose-100 bg-rose-50 p-3 text-xs text-rose-700">
              <AlertTriangle className="h-4 w-4 shrink-0" />{error}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : success ? (
            <section className="rounded-[28px] border border-emerald-100 bg-white p-6 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><Check className="h-7 w-7" /></div>
              <h3 className="mt-4 text-base font-bold">تم إرسال طلب الفريق</h3>
              <p className="mt-2 text-xs leading-6 text-slate-500">
                تتم مراجعة إشعار بقيمة {formatNumber(success.total)} {success.currency} لتفعيل {formatNumber(success.count)} من أعضاء الفريق.
              </p>
              <p className="mt-3 break-all font-mono text-[9px] text-slate-400" dir="ltr">{success.requestId}</p>
              <button onClick={onClose} className="mt-5 w-full rounded-2xl bg-slate-950 p-3 text-xs font-bold text-white">تم</button>
            </section>
          ) : options && plan ? (
            <>
              <section className="rounded-[28px] bg-gradient-to-br from-slate-950 to-emerald-950 p-4 text-white">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="text-[10px] text-emerald-300">{plan.display_name}</span>
                    <h3 className="mt-1 text-lg font-bold">{formatNumber(unitAmount)} {plan.currency}</h3>
                    <p className="mt-1 text-[10px] text-slate-300">لكل عضو · {formatNumber(plan.duration_days)} يوم · {formatNumber(plan.access_limit)} عملية</p>
                  </div>
                  <Users className="h-7 w-7 text-emerald-300" />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/10 pt-3 text-center">
                  <div><strong className="block text-sm">{formatNumber(selectedIds.length)}</strong><span className="text-[8px] text-slate-400">المستفيدون</span></div>
                  <div><strong className="block text-sm">{formatNumber(unitAmount)}</strong><span className="text-[8px] text-slate-400">سعر الوحدة</span></div>
                  <div><strong className="block text-sm text-emerald-300">{formatNumber(total)}</strong><span className="text-[8px] text-slate-400">الإجمالي</span></div>
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-3">
                <div className="mb-3 flex items-center justify-between">
                  <div><h3 className="text-xs font-bold">اختر أعضاء الفريق</h3><p className="mt-1 text-[9px] text-slate-500">يمكن اختيار عضو واحد أو عدة أعضاء</p></div>
                  <button onClick={selectAll} className="rounded-xl bg-slate-100 px-3 py-2 text-[9px] font-bold">
                    {selectedIds.length === options.members.length ? 'إلغاء الكل' : 'اختيار الكل'}
                  </button>
                </div>
                <div className="space-y-2">
                  {options.members.map((member) => {
                    const selected = selectedIds.includes(member.user_id);
                    return (
                      <button
                        key={member.user_id}
                        onClick={() => toggleMember(member.user_id)}
                        className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-right transition ${
                          selected ? 'border-emerald-300 bg-emerald-50/60' : 'border-slate-200'
                        }`}
                      >
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                          selected ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300'
                        }`}>{selected && <Check className="h-3 w-3" />}</span>
                        <span className="min-w-0 flex-1">
                          <strong className="block truncate text-xs">{member.full_name || 'مستخدم سند'}</strong>
                          <span className="mt-1 block text-[9px] text-slate-500">{member.job_title || 'موظف'} · <bdi dir="ltr">{toLatinDigits(member.phone || '')}</bdi></span>
                        </span>
                        {member.subscription && (
                          <span className="rounded-full bg-amber-50 px-2 py-1 text-[8px] font-bold text-amber-700">
                            تجديد · حتى {formatDate(member.subscription.current_period_end)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="space-y-3 rounded-3xl border border-slate-200 bg-white p-3">
                <div><h3 className="text-xs font-bold">حساب الإيداع</h3><p className="mt-1 text-[9px] text-slate-500">حوّل الإجمالي الظاهر أعلاه دفعة واحدة</p></div>
                {options.payment_accounts.map((account) => (
                  <button
                    key={account.id}
                    onClick={() => setSelectedAccountId(account.id)}
                    className={`w-full rounded-2xl border p-3 text-right ${
                      selectedAccountId === account.id ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200'
                    }`}
                  >
                    <strong className="block text-xs">{account.financial_entity}</strong>
                    <span className="mt-1 block font-mono text-xs" dir="ltr">{toLatinDigits(account.account_number)}</span>
                    <span className="mt-1 block text-[9px] text-slate-500">{account.account_holder_name}</span>
                  </button>
                ))}
                {selectedAccount && (
                  <button
                    onClick={() => {
                      void navigator.clipboard.writeText(selectedAccount.account_number);
                      setCopied(selectedAccount.id);
                      window.setTimeout(() => setCopied(null), 1800);
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 p-2.5 text-[10px] font-bold"
                  >
                    {copied === selectedAccount.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied === selectedAccount.id ? 'تم نسخ رقم الحساب' : 'نسخ رقم الحساب'}
                  </button>
                )}
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-3">
                <h3 className="text-xs font-bold">إشعار الحوالة</h3>
                <p className="mt-1 text-[9px] text-slate-500">يجب أن يطابق المبلغ {formatNumber(total)} {plan.currency}</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  className="hidden"
                  onChange={(event) => chooseFile(event.target.files?.[0])}
                />
                <button onClick={() => fileInputRef.current?.click()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-xs font-bold text-slate-600">
                  <UploadCloud className="h-5 w-5" />{file ? file.name : 'اختر صورة الإشعار أو PDF'}
                </button>
              </section>

              <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3 text-[10px] leading-5 text-amber-800">
                الأيام المتبقية لأي عضو لا تضيع؛ يبدأ التجديد بعد نهاية اشتراكه الحالي. السعر والمدة وحد الاستخدام مأخوذة مباشرة من قاعدة البيانات وقت إنشاء الطلب.
              </div>

              <button
                disabled={submitting || !selectedIds.length || !selectedAccountId || !file}
                onClick={() => void submit()}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 p-4 text-xs font-bold text-white disabled:bg-slate-300"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crown className="h-4 w-4" />}
                إرسال طلب بقيمة {formatNumber(total)} {plan.currency}
              </button>

              {selectedMembers.length > 0 && (
                <p className="text-center text-[9px] text-slate-400">سيتم إنشاء {formatNumber(selectedMembers.length)} اشتراك مستقل عند اعتماد الطلب.</p>
              )}
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}
