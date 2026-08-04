from pathlib import Path

path = Path('supabase/functions/sanad-v3-analyze-operation/extraction-v3.ts')
source = path.read_text(encoding='utf-8')

old = """  if (primaryIdentifier && escalationIdentifier) {
    const sameKey = primaryIdentifier.type === escalationIdentifier.type
      && primaryIdentifier.value === escalationIdentifier.value
      && comparable(primaryIdentifier.financial_entity) === comparable(escalationIdentifier.financial_entity);
    if (!sameKey) unresolvedConflicts.push('financial_identity_conflict');
  }
"""

new = """  if (primaryIdentifier && escalationIdentifier) {
    const sameEntity = comparable(primaryIdentifier.financial_entity)
      === comparable(escalationIdentifier.financial_entity);
    const sameType = primaryIdentifier.type === escalationIdentifier.type;
    const sameValue = primaryIdentifier.value === escalationIdentifier.value;

    // Multiple typed identifiers may legitimately identify the same party.
    // A national ID/card and a financial account are enrichment, not conflict.
    // Only two different values competing for the same identifier type inside
    // the same financial-entity scope require manual review.
    if (sameEntity && sameType && !sameValue) {
      unresolvedConflicts.push('financial_identity_conflict');
    }
  }
"""

count = source.count(old)
if count != 1:
    raise SystemExit(f'typed identifier reconciliation: expected one match, found {count}')

path.write_text(source.replace(old, new, 1), encoding='utf-8')
print('Typed identifier reconciliation corrected.')
