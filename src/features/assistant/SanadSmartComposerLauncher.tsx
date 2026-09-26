import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ChevronDown, Plus, Search, X } from 'lucide-react';
import type { VerifiedAssistantProjectScope } from './sanadProjectQuickPrompts';
import {
  buildGuidedComposerPrompt,
  composerActionsForScope,
  type SanadComposerActionDescriptor,
} from './sanadSpecialistComposerCatalog';

export default function SanadSmartComposerLauncher({
  scope,
  threadId,
  disabled,
  onPreparePrompt,
}: {
  scope: VerifiedAssistantProjectScope | null;
  threadId: string;
  disabled: boolean;
  onPreparePrompt: (prompt: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<SanadComposerActionDescriptor | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const actions = composerActionsForScope(scope);
  const filtered = actions.filter((action) =>
    `${action.title} ${action.description}`.toLocaleLowerCase('ar').includes(query.trim().toLocaleLowerCase('ar')));

  // Changing projects must discard stale in-memory suggestions, not turn them
  // into a request for another business. The textarea itself is separately
  // owned by the existing conversation composer.
  useEffect(() => {
    setOpen(false);
    setSelected(null);
    setValues({});
    setError(null);
    setQuery('');
  }, [threadId, scope]);

  useEffect(() => {
    if (open && !selected) searchRef.current?.focus();
  }, [open, selected]);

  useEffect(() => {
    if (!open) return;
    function onOutside(event: MouseEvent) {
      if (event.target instanceof Node && !hostRef.current?.contains(event.target)) {
        setOpen(false);
        setSelected(null);
      }
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  function close() {
    setOpen(false);
    setSelected(null);
    setQuery('');
    setValues({});
    setError(null);
  }

  function choose(action: SanadComposerActionDescriptor) {
    setSelected(action);
    setValues({});
    setError(null);
  }

  function prepare(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    const prompt = buildGuidedComposerPrompt(selected, values);
    if (!prompt) {
      setError('أكمل الحقول المطلوبة وتحقق من التواريخ قبل المتابعة.');
      return;
    }
    onPreparePrompt(prompt);
    close();
  }

  function searchKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      hostRef.current?.querySelector<HTMLButtonElement>('[data-smart-action-id]')?.focus();
    }
  }

  if (scope !== 'personal' && scope !== 'business') return null;

  return (
    <div ref={hostRef} data-sanad-smart-composer="launcher" className="relative self-center">
      <button type="button" aria-expanded={open} aria-haspopup="dialog"
        aria-label="إجراء أو إضافة" title="إجراء أو إضافة"
        disabled={disabled}
        onClick={() => {
          if (open) close();
          else setOpen(true);
        }}
        className="sanad-focus-ring flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-cyan-100 bg-cyan-50 text-teal-900 transition-colors hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-50">
        <Plus aria-hidden="true" className="h-5 w-5" />
      </button>
      {open ? (
        <div role="dialog" aria-label="إجراء أو إضافة" dir="rtl"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              close();
            }
          }}
          data-sanad-smart-composer-panel
          className="absolute bottom-[calc(100%+12px)] right-0 z-50 w-[min(330px,calc(100vw-32px))] max-w-[calc(100vw-32px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_16px_36px_rgba(15,23,42,0.15)] sm:w-[390px]">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
            <div>
              <p className="text-sm font-semibold text-slate-900">{selected ? selected.title : 'إجراء أو إضافة'}</p>
              <p className="text-[11px] text-slate-500">
                {scope === 'personal' ? 'المدير الشخصي' : 'الأعمال'} · اختصاصات سند
              </p>
            </div>
            <button type="button" aria-label="إغلاق قائمة الإجراءات" onClick={close}
              className="sanad-focus-ring flex min-h-10 min-w-10 items-center justify-center rounded-lg hover:bg-slate-50">
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
          {!selected ? (
            <>
              <label className="mx-3 mt-3 flex items-center gap-2 rounded-xl border border-slate-200 px-3">
                <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500" />
                <span className="sr-only">البحث عن إجراء</span>
                <input ref={searchRef} value={query}
                  onKeyDown={searchKey}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="ابحث عن إجراء…"
                  className="min-h-11 min-w-0 w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400" />
              </label>
              <div role="list" className="max-h-[min(320px,46vh)] overflow-y-auto overscroll-contain px-2 pb-2 pt-2">
                {filtered.map((action) => (
                  <div role="listitem" key={action.id}>
                    <button type="button" data-smart-action-id={action.id}
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                          event.preventDefault();
                          const buttons = [...hostRef.current?.querySelectorAll<HTMLButtonElement>('[data-smart-action-id]') || []];
                          const current = buttons.indexOf(event.currentTarget);
                          buttons[(current + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus();
                        }
                      }}
                      onClick={() => choose(action)}
                      className="sanad-focus-ring flex min-h-14 w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-right hover:bg-cyan-50">
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium text-slate-900">{action.title}</span>
                        <span className="mt-0.5 block text-[11px] leading-5 text-slate-500">{action.description}</span>
                      </span>
                      {action.state === 'guided_chat_only' ?
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-700">عبر المحادثة</span> :
                        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 -rotate-90 text-slate-500" />}
                    </button>
                  </div>
                ))}
                {!filtered.length ? <p role="status" className="p-4 text-xs text-slate-500">لا توجد إجراءات مطابقة في هذه المساحة.</p> : null}
              </div>
            </>
          ) : (
            // This is a prompt-preparation prototype, NOT an editable financial
            // draft. The existing assistant creates any canonical draft itself.
            <div className="px-3 py-3">
              <p className="text-xs leading-6 text-slate-600">{selected.description}</p>
              {selected.risk === 'draft_only' ? (
                <p role="note" className="mt-2 rounded-lg bg-amber-50 p-2.5 text-[11px] leading-5 text-amber-900">
                  هذه خطوة إرشادية، وليست مسودة محفوظة. ينشئ سند المسودة الفعلية من المحادثة ثم يعرضها للمراجعة المنفصلة.
                </p>
              ) : null}
              {selected.formFields.length ? (
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {selected.formFields.map((field) => (
                    <label key={field.id} className={field.type === 'text' ? 'sm:col-span-2' : ''}>
                      <span className="mb-1 block text-[12px] font-medium text-slate-800">
                        {field.label}{field.required ? ' *' : ''}
                      </span>
                      <input type={field.type} required={field.required}
                        maxLength={field.maxLength}
                        value={values[field.id] || ''}
                        onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))}
                        placeholder={field.type === 'text' ? 'اكتب جزءًا من الاسم أو رقم الحساب' : undefined}
                        className="sanad-focus-ring min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900" />
                    </label>
                  ))}
                </div>
              ) : null}
              {selected.id === 'customer_statement' ? (
                <p className="mt-2 text-[11px] leading-5 text-slate-500">
                  سيبحث سند عن الحساب من المصدر المصرح به. لا يُختار العميل بالاسم وحده عند تشابه النتائج.
                </p>
              ) : null}
              {error ? <p role="alert" className="mt-2 text-xs text-rose-700">{error}</p> : null}
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => {
                    setSelected(null);
                    setError(null);
                  }} className="sanad-focus-ring min-h-11 rounded-xl border border-slate-200 px-3 text-xs text-slate-800">
                  رجوع
                </button>
                <button type="button" onClick={(event) => prepare(event)}
                  className="sanad-focus-ring min-h-11 flex-1 rounded-xl border border-cyan-300 bg-gradient-to-l from-cyan-200 to-lime-100 px-3 text-xs font-semibold text-slate-900">
                  تجهيز الطلب في المحادثة
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
