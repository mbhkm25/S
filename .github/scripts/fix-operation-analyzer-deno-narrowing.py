from pathlib import Path

path = Path('supabase/functions/sanad-v3-analyze-operation/index.ts')
source = path.read_text(encoding='utf-8')

old = """        identifiers: (Array.isArray(source.identifiers) ? source.identifiers : [])
          .map((identifier) => normalizePartyIdentifier(identifier, fallbackEntity))
          .filter(Boolean)
          .slice(0, 12),
"""

new = """        identifiers: (Array.isArray(source.identifiers) ? source.identifiers : [])
          .map((identifier) => normalizePartyIdentifier(identifier, fallbackEntity))
          .filter((identifier): identifier is NonNullable<ReturnType<typeof normalizePartyIdentifier>> => identifier !== null)
          .slice(0, 12),
"""

count = source.count(old)
if count != 1:
    raise SystemExit(f'deno null narrowing: expected one match, found {count}')

path.write_text(source.replace(old, new, 1), encoding='utf-8')
print('Deno null narrowing corrected.')
