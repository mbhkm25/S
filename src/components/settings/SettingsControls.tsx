import type { Key, ReactNode } from 'react';

type SettingRowProps = {
  key?: Key;
  label: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  control: ReactNode;
  className?: string;
};

export function SettingRow({
  label,
  description,
  meta,
  control,
  className = '',
}: SettingRowProps) {
  return (
    <div
      data-setting-row
      className={`grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-slate-100 px-1 py-3 ${className}`}
    >
      <div data-setting-content className="min-w-0">
        <div className="text-[13px] font-medium leading-5 text-slate-800">{label}</div>
        {description ? (
          <div className="mt-1 break-words text-xs leading-5 text-slate-400">{description}</div>
        ) : null}
        {meta ? <div className="mt-1.5 min-w-0">{meta}</div> : null}
      </div>
      <div data-setting-control className="shrink-0 pt-0.5">
        {control}
      </div>
    </div>
  );
}

type SettingSwitchProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  pending?: boolean;
};

export function SettingSwitch({
  checked,
  onCheckedChange,
  label,
  disabled = false,
  pending = false,
}: SettingSwitchProps) {
  const unavailable = disabled || pending;

  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      aria-busy={pending || undefined}
      disabled={unavailable}
      onClick={() => onCheckedChange(!checked)}
      data-setting-switch
      data-state={checked ? 'on' : 'off'}
      data-pending={pending ? 'true' : 'false'}
      className="group inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl outline-none transition focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55"
    >
      <span
        aria-hidden="true"
        className={`relative block h-6 w-10 rounded-full transition-colors ${checked ? 'bg-slate-950' : 'bg-slate-200'}`}
      >
        <span
          className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-[inset-inline-start] duration-150 ${checked ? '[inset-inline-start:1.25rem]' : '[inset-inline-start:0.25rem]'}`}
        />
      </span>
    </button>
  );
}

type SettingsSectionProps = {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
};

export function SettingsSection({ title, description, children }: SettingsSectionProps) {
  return (
    <section data-settings-section>
      <div className="px-1 pb-2">
        <h3 className="text-sm font-semibold leading-6 text-slate-900">{title}</h3>
        {description ? <p className="mt-0.5 text-xs leading-5 text-slate-400">{description}</p> : null}
      </div>
      <div className="divide-y-0">{children}</div>
    </section>
  );
}
