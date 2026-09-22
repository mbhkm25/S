import type { HTMLAttributes, ReactNode } from 'react';

type SurfaceVariant = 'default' | 'subtle' | 'flat';
type StatusTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

export function SanadSurface({
  variant = 'default',
  className = '',
  ...props
}: HTMLAttributes<HTMLElement> & { variant?: SurfaceVariant }) {
  const variantClass = variant === 'subtle'
    ? 'sanad-surface-subtle'
    : variant === 'flat'
      ? 'sanad-surface-flat'
      : 'sanad-surface';

  return <section {...props} className={`${variantClass} ${className}`.trim()} />;
}

export function SanadSectionHeader({
  title,
  description,
  action,
  className = '',
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`sanad-section-header ${className}`.trim()}>
      <div className="min-w-0">
        <div className="sanad-section-title">{title}</div>
        {description ? <div className="sanad-section-description">{description}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function SanadStatusChip({
  tone = 'neutral',
  children,
  className = '',
}: {
  tone?: StatusTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`sanad-pill sanad-status-${tone} ${className}`.trim()}>
      {children}
    </span>
  );
}

export function SanadIconContainer({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={`sanad-icon-box ${className}`.trim()}>{children}</span>;
}
