// Finite preparation contracts. Model tool names never select arbitrary domain RPCs.
export const ACTION_PREPARATION_TYPES: Record<string, string> = {
  action_prepare_personal_transaction: 'personal_transaction',
  action_prepare_commercial_document: 'commercial_document_draft',
  action_prepare_personal_account: 'personal_account_setup',
  action_prepare_personal_category: 'personal_category_setup',
};

const ACTION_REVIEW_TYPES: Record<string,string> = {...ACTION_PREPARATION_TYPES, action_edit_personal_transaction:'personal_transaction', action_edit_personal_expense:'personal_transaction'};

export function isPersistedActionReview(toolName: string, output: unknown): boolean {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return false;
  const row = output as Record<string, unknown>;
  return Boolean(ACTION_REVIEW_TYPES[toolName])
    && !row.error
    && typeof row.id === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id)
    && row.action_type === ACTION_REVIEW_TYPES[toolName]
    && row.status === 'review'
    && Number.isInteger(row.version) && Number(row.version) > 0
    && Boolean(row.review && typeof row.review === 'object' && !Array.isArray(row.review));
}

export function assertSetupLookup(name: string, prior: { name: string; output: unknown }[]): void {
  const lookup = name === 'action_prepare_personal_account' ? 'finance_get_accounts'
    : name === 'action_prepare_personal_category' ? 'finance_get_categories' : null;
  if (!lookup) return;
  if (!prior.some(row => row.name === lookup && row.output && typeof row.output === 'object'
    && !('error' in row.output))) throw new Error('action_setup_requires_current_lookup');
}
