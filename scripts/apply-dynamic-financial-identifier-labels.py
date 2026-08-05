from pathlib import Path


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one match, found {count}: {old[:80]!r}')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')


runtime = Path('src/features/operations/OperationDetailsRuntimeV2.tsx')
replace_once(
    runtime,
    "import { getCurrencyPresentation } from '../../lib/currencyRegistry';",
    "import { getCurrencyPresentation } from '../../lib/currencyRegistry';\nimport { getFinancialIdentifierLabel } from '../../lib/financialIdentifierPresentation';",
)
replace_once(
    runtime,
    "    receiver_account?: string | null;\n    reference_number?: string | null;",
    "    receiver_account?: string | null;\n    receiver_identifier_type?: string | null;\n    reference_number?: string | null;",
)
replace_once(
    runtime,
    '<Fact label="رقم الحساب" value={runtime.operation.receiver_account ? toLatinDigits(String(runtime.operation.receiver_account)) : undefined} mono />',
    '<Fact label={getFinancialIdentifierLabel(runtime.operation.receiver_identifier_type)} value={runtime.operation.receiver_account ? toLatinDigits(String(runtime.operation.receiver_account)) : undefined} mono />',
)

details = Path('src/components/Details.tsx')
replace_once(
    details,
    "import { formatOperationReceivedAt } from '../lib/operationReceiptTime';",
    "import { formatOperationReceivedAt } from '../lib/operationReceiptTime';\nimport { getFinancialIdentifierLabel } from '../lib/financialIdentifierPresentation';",
)
details_text = details.read_text(encoding='utf-8')
label_marker = 'label="رقم الحساب"'
label_count = details_text.count(label_marker)
if label_count != 1:
    raise SystemExit(f'{details}: expected one static account label, found {label_count}')
details.write_text(
    details_text.replace(
        label_marker,
        'label={getFinancialIdentifierLabel(operation.receiver_identifier_type)}',
        1,
    ),
    encoding='utf-8',
)
