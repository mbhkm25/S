import { AlertTriangle, LogOut, RefreshCw } from 'lucide-react';

export default function ProfileLoadFailure({
  message,
  retrying,
  onRetry,
  onLogout,
}: {
  message?: string | null;
  retrying: boolean;
  onRetry: () => void;
  onLogout: () => void;
}) {
  return (
    <section className="mx-auto flex min-h-[320px] max-w-md items-center justify-center px-2 py-8" role="alert">
      <div className="w-full rounded-[1.75rem] border border-amber-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-base font-bold text-slate-900">تعذر تحميل بيانات الحساب</h2>
        <p className="mt-2 text-xs leading-6 text-slate-500">
          الجلسة مسجلة، لكن بيانات ملفك لم تكتمل بعد. أعد المحاولة، وإن استمرت المشكلة فاخرج ثم سجّل الدخول مجددًا.
        </p>
        {message ? (
          <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-[10px] leading-5 text-slate-500" dir="ltr">
            {message}
          </p>
        ) : null}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 text-xs font-bold text-white disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${retrying ? 'animate-spin' : ''}`} />
            إعادة المحاولة
          </button>
          <button
            type="button"
            onClick={onLogout}
            disabled={retrying}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-100 px-3 text-xs font-bold text-slate-700 disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" />
            تسجيل الخروج
          </button>
        </div>
      </div>
    </section>
  );
}
