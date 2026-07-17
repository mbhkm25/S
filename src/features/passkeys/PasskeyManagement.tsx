import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle, CheckCircle2, Fingerprint, KeyRound, Loader2, Pencil, Plus, Trash2, X,
} from 'lucide-react';
import {
  deleteCurrentUserPasskey,
  listCurrentUserPasskeys,
  registerCurrentUserPasskey,
  renameCurrentUserPasskey,
} from './passkeyApi';
import { isPasskeySupported } from './passkeySupport';
import { isPasskeyRequestCurrent } from './requestGuards';
import type { PasskeyRecord, PasskeySupportStatus } from './types';

interface PasskeyManagementProps {
  userId: string;
  key?: string;
}

function formatDate(value?: string) {
  if (!value) return 'غير متوفر';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'غير متوفر';
  return date.toLocaleDateString('ar-YE-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric', numberingSystem: 'latn' });
}

export default function PasskeyManagement({ userId }: PasskeyManagementProps) {
  const [support, setSupport] = useState<PasskeySupportStatus>('unknown');
  const [passkeys, setPasskeys] = useState<PasskeyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [renaming, setRenaming] = useState<PasskeyRecord | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleting, setDeleting] = useState<PasskeyRecord | null>(null);
  const generationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const operationRef = useRef<symbol | null>(null);
  const activeUserIdRef = useRef(userId);
  activeUserIdRef.current = userId;
  const mountedRef = useRef(true);

  const isRequestCurrent = (requestUserId: string, requestGeneration: number) =>
    isPasskeyRequestCurrent({
      mounted: mountedRef.current,
      activeUserId: activeUserIdRef.current,
      requestUserId,
      currentGeneration: generationRef.current,
      requestGeneration,
    });

  const loadPasskeys = async (requestUserId: string, requestGeneration: number) => {
    try {
      const items = await listCurrentUserPasskeys();
      if (!isRequestCurrent(requestUserId, requestGeneration)) return false;
      setPasskeys(items);
      return true;
    } catch (error) {
      if (isRequestCurrent(requestUserId, requestGeneration)) {
        setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'تعذر تحميل مفاتيح الدخول.' });
      }
      return false;
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      abortRef.current?.abort();
      operationRef.current = null;
      busyRef.current = false;
    };
  }, []);

  useEffect(() => {
    const requestUserId = userId;
    const requestGeneration = ++generationRef.current;
    abortRef.current?.abort();
    abortRef.current = null;
    operationRef.current = null;
    busyRef.current = false;
    setLoading(true);
    setSupport('unknown');
    setMessage(null);
    setPasskeys([]);
    setBusyAction(null);
    setRenaming(null);
    setRenameValue('');
    setDeleting(null);

    void (async () => {
      const result = await isPasskeySupported();
      if (!isRequestCurrent(requestUserId, requestGeneration)) return;
      setSupport(result.status);
      if (result.status === 'supported') {
        await loadPasskeys(requestUserId, requestGeneration);
        if (!isRequestCurrent(requestUserId, requestGeneration)) return;
      }
      setLoading(false);
    })();

    return () => {
      generationRef.current += 1;
      abortRef.current?.abort();
      operationRef.current = null;
      busyRef.current = false;
    };
  }, [userId]);

  const addPasskey = async () => {
    if (busyRef.current) return;
    const requestUserId = userId;
    const requestGeneration = generationRef.current;
    if (!isRequestCurrent(requestUserId, requestGeneration)) return;
    const operation = Symbol('add-passkey');
    operationRef.current = operation;
    busyRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusyAction('add');
    setMessage(null);
    try {
      await registerCurrentUserPasskey(controller.signal);
      if (!isRequestCurrent(requestUserId, requestGeneration)) return;
      const loaded = await loadPasskeys(requestUserId, requestGeneration);
      if (!isRequestCurrent(requestUserId, requestGeneration)) return;
      if (loaded) {
        setMessage({ tone: 'success', text: 'تم تفعيل الدخول بالبصمة.' });
      }
    } catch (error) {
      if (isRequestCurrent(requestUserId, requestGeneration)) setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'تعذر إضافة مفتاح الدخول.' });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      if (operationRef.current === operation) {
        operationRef.current = null;
        busyRef.current = false;
      }
      if (isRequestCurrent(requestUserId, requestGeneration)) setBusyAction(null);
    }
  };

  const saveRename = async () => {
    if (!renaming || busyRef.current) return;
    const cleanName = renameValue.trim();
    if (!cleanName || cleanName.length > 120) {
      if (mountedRef.current && activeUserIdRef.current === userId) {
        setMessage({ tone: 'error', text: 'اكتب اسمًا واضحًا لا يتجاوز 120 حرفًا.' });
      }
      return;
    }
    const requestUserId = userId;
    const requestGeneration = generationRef.current;
    if (!isRequestCurrent(requestUserId, requestGeneration)) return;
    const operation = Symbol('rename-passkey');
    operationRef.current = operation;
    busyRef.current = true;
    setBusyAction(`rename:${renaming.id}`);
    setMessage(null);
    try {
      await renameCurrentUserPasskey(renaming.id, cleanName);
      if (!isRequestCurrent(requestUserId, requestGeneration)) return;
      const loaded = await loadPasskeys(requestUserId, requestGeneration);
      if (!isRequestCurrent(requestUserId, requestGeneration)) return;
      if (loaded) {
        setRenaming(null);
        setMessage({ tone: 'success', text: 'تم تحديث اسم مفتاح الدخول.' });
      }
    } catch (error) {
      if (isRequestCurrent(requestUserId, requestGeneration)) setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'تعذر إعادة التسمية.' });
    } finally {
      if (operationRef.current === operation) {
        operationRef.current = null;
        busyRef.current = false;
      }
      if (isRequestCurrent(requestUserId, requestGeneration)) setBusyAction(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting || busyRef.current) return;
    const requestUserId = userId;
    const requestGeneration = generationRef.current;
    if (!isRequestCurrent(requestUserId, requestGeneration)) return;
    const operation = Symbol('delete-passkey');
    operationRef.current = operation;
    busyRef.current = true;
    setBusyAction(`delete:${deleting.id}`);
    setMessage(null);
    try {
      await deleteCurrentUserPasskey(deleting.id);
      if (!isRequestCurrent(requestUserId, requestGeneration)) return;
      const loaded = await loadPasskeys(requestUserId, requestGeneration);
      if (!isRequestCurrent(requestUserId, requestGeneration)) return;
      if (loaded) {
        setDeleting(null);
        setMessage({ tone: 'success', text: 'تم حذف مفتاح الدخول.' });
      }
    } catch (error) {
      if (isRequestCurrent(requestUserId, requestGeneration)) setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'تعذر حذف مفتاح الدخول.' });
    } finally {
      if (operationRef.current === operation) {
        operationRef.current = null;
        busyRef.current = false;
      }
      if (isRequestCurrent(requestUserId, requestGeneration)) setBusyAction(null);
    }
  };

  if (loading) {
    return <div className="min-h-24 flex items-center justify-center text-slate-500"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  }

  if (support !== 'supported') {
    return (
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-start gap-3">
          <Fingerprint className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
          <div><h3 className="text-sm font-bold">مفاتيح الدخول</h3><p className="text-xs text-slate-500 leading-6 mt-1">{support === 'requires_native_bridge' ? 'تتوفر إدارة الدخول بالبصمة حاليًا من نسخة الويب أو PWA. يمكنك الاستمرار باستخدام البريد وكلمة المرور داخل التطبيق.' : 'هذا الجهاز أو المتصفح لا يدعم الدخول بالبصمة حاليًا. يمكنك الاستمرار باستخدام البريد وكلمة المرور.'}</p></div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3" aria-labelledby="passkey-management-title">
      <div>
        <h3 id="passkey-management-title" className="text-sm font-bold text-slate-900">مفاتيح الدخول</h3>
        <p className="text-xs text-slate-500 leading-6 mt-1">تتيح لك الدخول باستخدام بصمة الإصبع أو قفل جهازك.</p>
      </div>

      {message && <div role="status" className={`rounded-xl border p-3 text-xs flex items-start gap-2 ${message.tone === 'success' ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-rose-100 bg-rose-50 text-rose-700'}`}>{message.tone === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}<span>{message.text}</span></div>}

      {passkeys.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center">
          <KeyRound className="w-7 h-7 mx-auto text-slate-400" />
          <p className="text-sm font-bold mt-3">لم تُفعّل الدخول بالبصمة بعد.</p>
          <button type="button" disabled={Boolean(busyAction)} onClick={addPasskey} className="mt-4 min-h-12 w-full rounded-xl bg-slate-950 text-white text-sm font-bold flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60">{busyAction === 'add' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Fingerprint className="w-5 h-5" />}تفعيل الدخول بالبصمة</button>
        </div>
      ) : (
        <div className="space-y-2">
          {passkeys.map((passkey) => (
            <article key={passkey.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <span className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0"><KeyRound className="w-5 h-5" /></span>
                <div className="min-w-0 flex-1"><h4 className="text-sm font-bold truncate">{passkey.friendlyName}</h4><p className="text-[10px] text-slate-500 mt-1">أُنشئ في {formatDate(passkey.createdAt)}</p>{passkey.lastUsedAt && <p className="text-[10px] text-slate-500 mt-0.5">آخر استخدام: {formatDate(passkey.lastUsedAt)}</p>}</div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <button type="button" disabled={Boolean(busyAction)} onClick={() => { setRenameValue(passkey.friendlyName); setRenaming(passkey); setMessage(null); }} className="min-h-11 rounded-xl border border-slate-200 text-xs font-bold flex items-center justify-center gap-2 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-500 disabled:opacity-50"><Pencil className="w-4 h-4" />إعادة تسمية</button>
                <button type="button" disabled={Boolean(busyAction)} onClick={() => { setDeleting(passkey); setMessage(null); }} className="min-h-11 rounded-xl border border-rose-200 text-rose-600 text-xs font-bold flex items-center justify-center gap-2 hover:bg-rose-50 focus-visible:ring-2 focus-visible:ring-rose-500 disabled:opacity-50"><Trash2 className="w-4 h-4" />حذف</button>
              </div>
            </article>
          ))}
          <button type="button" disabled={Boolean(busyAction)} onClick={addPasskey} className="w-full min-h-12 rounded-xl border border-slate-300 text-slate-800 text-sm font-bold flex items-center justify-center gap-2 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-500 disabled:opacity-60">{busyAction === 'add' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}إضافة مفتاح دخول جديد</button>
        </div>
      )}

      {renaming && (
        <div className="fixed inset-0 z-[110] bg-slate-950/45 flex items-end sm:items-center justify-center p-3" role="dialog" aria-modal="true" aria-labelledby="rename-passkey-title">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between"><h3 id="rename-passkey-title" className="text-base font-bold">إعادة تسمية مفتاح الدخول</h3><button type="button" aria-label="إغلاق" disabled={Boolean(busyAction)} onClick={() => setRenaming(null)} className="w-11 h-11 rounded-xl flex items-center justify-center hover:bg-slate-100"><X className="w-5 h-5" /></button></div>
            <label className="block text-xs font-bold text-slate-600 mt-4">الاسم</label>
            <input autoFocus maxLength={120} value={renameValue} onChange={(event) => setRenameValue(event.target.value)} className="profile-input mt-2" />
            <div className="grid grid-cols-2 gap-2 mt-4"><button type="button" disabled={Boolean(busyAction)} onClick={saveRename} className="min-h-12 rounded-xl bg-slate-950 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60">{busyAction?.startsWith('rename:') && <Loader2 className="w-4 h-4 animate-spin" />}حفظ</button><button type="button" disabled={Boolean(busyAction)} onClick={() => setRenaming(null)} className="min-h-12 rounded-xl text-slate-600 text-sm font-bold hover:bg-slate-50">إلغاء</button></div>
          </div>
        </div>
      )}

      {deleting && (
        <div className="fixed inset-0 z-[110] bg-slate-950/45 flex items-end sm:items-center justify-center p-3" role="dialog" aria-modal="true" aria-labelledby="delete-passkey-title">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl">
            <h3 id="delete-passkey-title" className="text-base font-bold">هل تريد حذف مفتاح الدخول؟</h3>
            <p className="text-xs text-slate-600 leading-6 mt-2">بعد الحذف ستحتاج إلى استخدام البريد وكلمة المرور أو مفتاح آخر للدخول. لن يُحذف حسابك أو بيانات ملفك الشخصي.</p>
            <div className="grid grid-cols-2 gap-2 mt-5"><button type="button" disabled={Boolean(busyAction)} onClick={confirmDelete} className="min-h-12 rounded-xl bg-rose-600 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60">{busyAction?.startsWith('delete:') && <Loader2 className="w-4 h-4 animate-spin" />}حذف</button><button type="button" disabled={Boolean(busyAction)} onClick={() => setDeleting(null)} className="min-h-12 rounded-xl text-slate-600 text-sm font-bold hover:bg-slate-50">إلغاء</button></div>
          </div>
        </div>
      )}
    </section>
  );
}
