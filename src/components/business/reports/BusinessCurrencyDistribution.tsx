import { useMemo } from 'react';
import type { BusinessOperationItem } from '../../../lib/businessApi';
import { formatNumberLatin } from '../../../utils/numerals';

interface BusinessCurrencyDistributionProps {
  operations: BusinessOperationItem[];
}

export default function BusinessCurrencyDistribution({
  operations
}: BusinessCurrencyDistributionProps) {
  const counts = useMemo(() => {
    const result = new Map<string, number>();
    operations.forEach((item) => {
      const currency = item.operation?.currency;
      if (currency) result.set(currency, (result.get(currency) || 0) + 1);
    });
    return ['YER', 'SAR', 'USD']
      .map((currency) => ({ currency, count: result.get(currency) || 0 }))
      .filter(({ count }) => count > 0);
  }, [operations]);

  return (
    <section className="space-y-3 text-right">
      <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
        توزيع العمليات حسب العملة
      </h3>
      {counts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-[10px] text-slate-400">
          لا توجد عمليات ضمن الفترة المحددة.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {counts.map(({ currency, count }) => (
            <div key={currency} className="rounded-2xl border border-slate-200 bg-white p-3 text-center">
              <span className="block font-mono text-xs font-bold text-slate-800">{currency}</span>
              <span className="mt-1 block text-[9px] text-slate-500">
                {formatNumberLatin(count)} عمليات
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
