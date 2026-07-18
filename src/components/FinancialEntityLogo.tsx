import { Landmark } from 'lucide-react';
import { getFinancialEntityDefinition } from '../lib/financialEntities';

interface FinancialEntityLogoProps {
  entity?: unknown;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
  decorative?: boolean;
}

export default function FinancialEntityLogo({
  entity,
  className = 'h-11 w-11 rounded-xl',
  imageClassName = 'h-full w-full object-contain',
  fallbackClassName = 'text-slate-400',
  decorative = false
}: FinancialEntityLogoProps) {
  const definition = getFinancialEntityDefinition(entity);
  const label = definition?.nameAr || String(entity || 'جهة مالية');

  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden bg-white shadow-sm ${className}`}
      title={label}
      aria-label={decorative ? undefined : `شعار ${label}`}
      aria-hidden={decorative ? true : undefined}
    >
      {definition ? (
        <img
          src={definition.logo}
          alt={decorative ? '' : `شعار ${definition.nameAr}`}
          className={imageClassName}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <Landmark className={`h-5 w-5 ${fallbackClassName}`} aria-hidden="true" />
      )}
    </span>
  );
}
