from pathlib import Path

path = Path('src/components/business/PaymentInbox.tsx')
source = path.read_text(encoding='utf-8')

source = source.replace(', UserRound, UserRoundCheck, WalletCards', ', UserRoundCheck, WalletCards')

old_component = '''function DataCell({ icon, label, value, ltr = false }: { icon: React.ReactNode; label: string; value?: string | null; ltr?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
      <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400">{icon}<span>{label}</span></div>
      <p dir={ltr ? 'ltr' : 'rtl'} className={`mt-1.5 truncate text-[11px] font-black text-slate-800 ${ltr ? 'text-left font-mono' : ''}`}>{value || '—'}</p>
    </div>
  );
}
'''
new_component = '''function CompactFact({ icon, label, value, ltr = false }: { icon: React.ReactNode; label: string; value?: string | null; ltr?: boolean }) {
  return (
    <div className="min-w-0 px-2 py-2">
      <div className="flex items-center gap-1 text-[8px] font-bold text-slate-400">{icon}<span>{label}</span></div>
      <p dir={ltr ? 'ltr' : 'rtl'} className={`mt-1 truncate text-[10px] font-black text-slate-800 ${ltr ? 'text-left font-mono' : ''}`}>{value || '—'}</p>
    </div>
  );
}
'''
if old_component not in source:
    raise SystemExit('DataCell component block not found')
source = source.replace(old_component, new_component, 1)

old_grid = '''              <div className="mt-4 grid grid-cols-2 gap-2">
                <DataCell icon={<CalendarDays className="h-3.5 w-3.5" />} label="التاريخ" value={formatDate(operationDate)} />
                <DataCell icon={<Clock3 className="h-3.5 w-3.5" />} label="الوقت" value={formatTime(operationDate)} />
                <DataCell icon={<WalletCards className="h-3.5 w-3.5" />} label="رقم الحساب" value={accountNumber ? toLatinDigits(accountNumber) : '—'} ltr />
                <DataCell icon={<Hash className="h-3.5 w-3.5" />} label="المرجع" value={item.reference_number ? toLatinDigits(item.reference_number) : '—'} ltr />
                <div className="col-span-2"><DataCell icon={<UserRound className="h-3.5 w-3.5" />} label="اسم الحساب" value={accountName} /></div>
              </div>
'''
new_grid = '''              <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70">
                <div className="grid grid-cols-4 divide-x divide-x-reverse divide-slate-200">
                  <CompactFact icon={<CalendarDays className="h-3 w-3" />} label="التاريخ" value={formatDate(operationDate)} />
                  <CompactFact icon={<Clock3 className="h-3 w-3" />} label="الوقت" value={formatTime(operationDate)} />
                  <CompactFact icon={<WalletCards className="h-3 w-3" />} label="الحساب" value={accountNumber ? toLatinDigits(accountNumber) : '—'} ltr />
                  <CompactFact icon={<Hash className="h-3 w-3" />} label="المرجع" value={item.reference_number ? toLatinDigits(item.reference_number) : '—'} ltr />
                </div>
              </div>
'''
if old_grid not in source:
    raise SystemExit('payment facts grid block not found')
source = source.replace(old_grid, new_grid, 1)

path.write_text(source, encoding='utf-8')
print('Compacted payment inbox facts into one four-column table and removed duplicate account name.')
