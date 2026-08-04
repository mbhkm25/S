from pathlib import Path

path = Path('src/components/business/PaymentInbox.tsx')
source = path.read_text(encoding='utf-8')

replacements = [
    (
        "const CASHIER_TABS: Array<{ value: PaymentInboxView; label: string }> = [{ value: 'new', label: 'جديدة' }, { value: 'mine', label: 'لدي' }];",
        "const CASHIER_TABS: Array<{ value: PaymentInboxView; label: string }> = [\n  { value: 'new', label: 'جديدة' },\n  { value: 'mine', label: 'لدي' },\n  { value: 'completed', label: 'مكتملة' }\n];",
    ),
    (
        "${admin ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2'}",
        "${admin ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}",
    ),
    (
        "<h2 className=\"mt-3 text-sm font-black text-slate-800\">لا توجد عمليات في هذا القسم</h2><p className=\"mt-1 text-[10px] text-slate-400\">ستظهر العمليات تلقائيًا عند وصولها أو تغير حالتها.</p>",
        "<h2 className=\"mt-3 text-sm font-black text-slate-800\">{view === 'completed' ? 'لا توجد عمليات مكتملة' : 'لا توجد عمليات في هذا القسم'}</h2><p className=\"mt-1 text-[10px] text-slate-400\">{view === 'completed' ? 'ستظهر هنا العمليات التي أكملتها واعتمدتها لهذا النشاط.' : 'ستظهر العمليات تلقائيًا عند وصولها أو تغير حالتها.'}</p>",
    ),
]

for old, new in replacements:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'expected one match, found {count}: {old[:80]}')
    source = source.replace(old, new, 1)

path.write_text(source, encoding='utf-8')
print('Team payment inbox completed tab added.')
