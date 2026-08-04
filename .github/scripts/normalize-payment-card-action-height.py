from pathlib import Path

path = Path('src/components/business/PaymentInbox.tsx')
source = path.read_text(encoding='utf-8')
updated = source.replace('min-h-12', 'min-h-11')
if updated == source:
    raise SystemExit('expected min-h-12 action classes were not found')
path.write_text(updated, encoding='utf-8')
print('Normalized payment inbox action heights to min-h-11.')
