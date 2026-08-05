from pathlib import Path

runtime = Path('src/features/operations/OperationDetailsRuntimeV2.tsx')
text = runtime.read_text(encoding='utf-8')

currency_import = "import { getCurrencyPresentation } from '../../lib/currencyRegistry';"
identifier_import = "import { getFinancialIdentifierLabel } from '../../lib/financialIdentifierPresentation';"
if identifier_import not in text:
    if text.count(currency_import) != 1:
        raise SystemExit('currency registry import marker was not found exactly once')
    text = text.replace(currency_import, f'{currency_import}\n{identifier_import}', 1)

identifier_type_field = '    receiver_identifier_type?: string | null;'
if identifier_type_field not in text:
    account_field = '    receiver_account?: string | null;'
    if text.count(account_field) != 1:
        raise SystemExit('receiver account type marker was not found exactly once')
    text = text.replace(account_field, f'{account_field}\n{identifier_type_field}', 1)

old_fact = '<Fact label="رقم الحساب" value={runtime.operation.receiver_account ? toLatinDigits(String(runtime.operation.receiver_account)) : undefined} mono />'
new_fact = '<Fact label={getFinancialIdentifierLabel(runtime.operation.receiver_identifier_type)} value={runtime.operation.receiver_account ? toLatinDigits(String(runtime.operation.receiver_account)) : undefined} mono />'
if new_fact not in text:
    if text.count(old_fact) != 1:
        raise SystemExit('static receiver account fact marker was not found exactly once')
    text = text.replace(old_fact, new_fact, 1)

runtime.write_text(text, encoding='utf-8')
