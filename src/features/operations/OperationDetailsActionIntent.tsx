import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { claimPaymentInboxItem, completePaymentInboxItem, getPaymentInboxProAccess, type PaymentInboxItem } from '../../lib/paymentInboxApi';

type IntentAction = 'claim' | 'claim_verify' | 'complete' | 'open_original';

function readIntent() {
  const url = new URL(window.location.href);
  const action = url.searchParams.get('inbox_action') as IntentAction | null;
  const inboxId = url.searchParams.get('inbox_id');
  const rowVersion = Number(url.searchParams.get('row_version'));
  const publicToken = window.location.pathname.match(/\/v\/([^/]+)/)?.[1] || null;
  if (!action || !publicToken) return null;
  return { action, inboxId, rowVersion, publicToken };
}

function clearIntentParams() {
  const url = new URL(window.location.href);
  for (const key of ['inbox_action', 'inbox_id', 'row_version', 'business_id']) url.searchParams.delete(key);
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function findOriginalFileButton() {
  const root = document.getElementById('details_view');
  if (!root) return null;
  return Array.from(root.querySelectorAll('button')).find(button => button.textContent?.trim().includes('فتح الملف الأصلي')) as HTMLButtonElement | undefined || null;
}

function waitForElement<T extends Element>(resolver: () => T | null, timeoutMs = 15000): Promise<T> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      const element = resolver();
      if (element) {
        window.clearInterval(timer);
        resolve(element);
      } else if (document.querySelector('[id^="gate_"]') || Date.now() - started >= timeoutMs) {
        window.clearInterval(timer);
        reject(new Error(document.querySelector('[id^="gate_"]') ? 'access_gate' : 'action_target_timeout'));
      }
    }, 180);
  });
}

export default function OperationDetailsActionIntent() {
  const processedRef = useRef<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const intent = readIntent();
      if (!intent) return;
      const key = `${intent.publicToken}:${intent.action}:${intent.inboxId || ''}:${intent.rowVersion}`;
      if (processedRef.current === key) return;
      processedRef.current = key;
      try {
        await waitForElement(() => document.getElementById('details_view'));
        const pro = await getPaymentInboxProAccess();
        if (!pro.isPro) {
          setStatus('error');
          setMessage('يتطلب هذا الإجراء اشتراكًا نشطًا في سند Pro.');
          return;
        }
        if (cancelled) return;
        setStatus('running');
        setMessage('جاري تنفيذ الإجراء داخل سجل العملية...');
        const item = { id: intent.inboxId || '', row_version: Number.isFinite(intent.rowVersion) ? intent.rowVersion : 0, public_token: intent.publicToken } as PaymentInboxItem;
        if (intent.action === 'claim' || intent.action === 'claim_verify') {
          if (!intent.inboxId) throw new Error('تعذر تحديد سجل وارد المدفوعات.');
          await claimPaymentInboxItem(item);
        }
        if (intent.action === 'complete') {
          if (!intent.inboxId) throw new Error('تعذر تحديد سجل وارد المدفوعات.');
          await completePaymentInboxItem(item);
        }
        if (intent.action === 'claim_verify') {
          const button = await waitForElement(() => document.getElementById('btn_confirm_verify') as HTMLButtonElement | null);
          button.click();
          setMessage('تم استلام العملية وتشغيل إجراء التحقق داخل السجل.');
        } else if (intent.action === 'open_original') {
          const button = await waitForElement(findOriginalFileButton);
          button.click();
          setMessage('تم تشغيل فتح الملف الأصلي من داخل السجل.');
        } else if (intent.action === 'claim') setMessage('تم استلام العملية بنجاح.');
        else setMessage('تم إكمال العملية بنجاح.');
        clearIntentParams();
        setStatus('success');
        window.setTimeout(() => { if (!cancelled) setStatus('idle'); }, 3500);
      } catch (cause) {
        if (cause instanceof Error && cause.message === 'access_gate') return;
        setStatus('error');
        setMessage(cause instanceof Error ? cause.message : 'تعذر تنفيذ الإجراء داخل سجل العملية.');
      }
    };
    void run();
    const timer = window.setInterval(() => void run(), 400);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  if (status === 'idle') return null;
  return createPortal(
    <div dir="rtl" className="fixed inset-x-3 bottom-[calc(82px+env(safe-area-inset-bottom))] z-[160] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-2xl">
      {status === 'running' && <Loader2 className="h-5 w-5 shrink-0 animate-spin text-blue-600" />}
      {status === 'success' && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />}
      {status === 'error' && <XCircle className="h-5 w-5 shrink-0 text-rose-600" />}
      <p className={`min-w-0 flex-1 text-[11px] font-bold leading-5 ${status === 'error' ? 'text-rose-700' : 'text-slate-700'}`}>{message}</p>
      {status === 'error' && <button type="button" onClick={() => setStatus('idle')} className="text-[10px] font-bold text-slate-500">إغلاق</button>}
    </div>, document.body
  );
}
