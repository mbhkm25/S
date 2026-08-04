from pathlib import Path

path = Path('src/features/operations/OperationDetailsRuntimeV2.tsx')
source = path.read_text(encoding='utf-8')
old = "const [tab, setTab] = useState<Tab>('operation');"
new = "const [tab, setTab] = useState<Tab>('document');"
count = source.count(old)
if count != 1:
    raise SystemExit(f'expected one default tab match, found {count}')
path.write_text(source.replace(old, new, 1), encoding='utf-8')
print('Default operation-details tab changed to document.')
