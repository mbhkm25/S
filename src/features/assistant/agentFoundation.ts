export type SanadAssistantThinkingLevel = 'low' | 'medium' | 'high';
export type SanadAssistantToolRisk = 'read_only' | 'draft_only' | 'approval_required';
export type SanadAssistantScope = 'personal' | 'business' | 'account' | 'product';

export const SANAD_ASSISTANT_MODEL_POLICY = {
  primaryModel: 'gemini-3.8-flash',
  defaultThinkingLevel: 'medium' as SanadAssistantThinkingLevel,
  fastThinkingLevel: 'low' as SanadAssistantThinkingLevel,
  deepThinkingLevel: 'high' as SanadAssistantThinkingLevel,
  shadowCandidateModel: 'gemini-3.1-pro-preview',
  shadowCandidateProductionEnabled: false,
  useInteractionsApi: true,
  useGenerateContentForNewWebAgent: false,
  externalConversationState: 'stateless' as const,
} as const;

export const SANAD_ASSISTANT_INTELLIGENCE_POLICY = {
  version: 'sanad-insights-v2',
  deterministicFactsOnly: true,
  modelMayExplainButNotCreateAlerts: true,
  maxInsightsPerTurn: 8,
  staleReplicaInfoHours: 12,
  staleReplicaWarningHours: 24,
  obligationDueSoonDays: 7,
  goalDueSoonDays: 30,
  budgetNearLimitPercent: 80,
  preserveCurrenciesSeparately: true,
} as const;

export const SANAD_ASSISTANT_EXECUTION_POLICY = {
  maxToolCallsPerTurn: 8,
  maxSequentialToolRounds: 5,
  maxParallelToolsPerRound: 4,
  writeToolsEnabled: false,
  draftToolsEnabled: true,
  approvalExecutionAvailableOnlyInUi: true,
  requireUserApprovalForMutations: true,
  neverExposeRawErpRows: true,
  neverMergeCurrencies: true,
  neverUseFreeFormSql: true,
  requireSourcePeriodAndCurrencyWhenFinancial: true,
} as const;

export type SanadAssistantToolDefinition = {
  name: string;
  description: string;
  scope: SanadAssistantScope;
  risk: SanadAssistantToolRisk;
  authoritativeSource: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: readonly string[];
    }>;
    required?: readonly string[];
    additionalProperties: false;
  };
};

export const SANAD_ASSISTANT_TOOLS: readonly SanadAssistantToolDefinition[] = [
  {
    name: 'finance_get_overview',
    description: 'Read the authenticated user personal financial overview, preserving every currency separately. Use for broad personal reviews; pair with finance_get_budgets when the user asks what needs attention.',
    scope: 'personal',
    risk: 'read_only',
    authoritativeSource: 'get_ai_financial_context_v2',
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Optional ISO date YYYY-MM-DD.' },
        to: { type: 'string', description: 'Optional ISO date YYYY-MM-DD.' },
        limit: { type: 'integer', description: 'Bounded recent item count.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'finance_search_transactions',
    description: 'Read recent personal financial transactions for a bounded period and optional semantic query.',
    scope: 'personal',
    risk: 'read_only',
    authoritativeSource: 'get_ai_financial_context_v2',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Optional natural-language transaction or party query.' },
        from: { type: 'string', description: 'Optional ISO date YYYY-MM-DD.' },
        to: { type: 'string', description: 'Optional ISO date YYYY-MM-DD.' },
        limit: { type: 'integer', description: 'Bounded result count.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'finance_get_obligations',
    description: 'Read authenticated user receivables and payables, including due dates and currency.',
    scope: 'personal',
    risk: 'read_only',
    authoritativeSource: 'personal_finance_obligations',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Optional obligation status filter.' },
        limit: { type: 'integer', description: 'Bounded result count.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'finance_get_budgets',
    description: 'Read active personal budgets and consumption progress.',
    scope: 'personal',
    risk: 'read_only',
    authoritativeSource: 'get_my_budget_progress_v1',
    parameters: {
      type: 'object',
      properties: {
        on_date: { type: 'string', description: 'Optional ISO date YYYY-MM-DD.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'finance_get_goals',
    description: 'Read active personal financial goals and progress.',
    scope: 'personal',
    risk: 'read_only',
    authoritativeSource: 'personal_finance_goals',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'finance_search_parties',
    description: 'Search authenticated user personal financial counterparties by name or phone.',
    scope: 'personal',
    risk: 'read_only',
    authoritativeSource: 'personal_finance_parties',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Name or phone search text.' },
        limit: { type: 'integer', description: 'Bounded result count.' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'business_list_accessible',
    description: 'List businesses the authenticated user is authorized to access.',
    scope: 'business',
    risk: 'read_only',
    authoritativeSource: 'get_my_account_center_v1',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'business_get_dashboard',
    description: 'Read a business commercial dashboard using the authorized business scope, including open receivables/payables by currency and overdue document count. Use for broad business attention reviews.',
    scope: 'business',
    risk: 'read_only',
    authoritativeSource: 'get_business_commercial_dashboard_v1',
    parameters: {
      type: 'object',
      properties: {
        business_id: { type: 'string', description: 'Authorized SANAD business UUID.' },
      },
      required: ['business_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'erp_get_replica_status',
    description: 'Read the latest completed ERP cloud replica status without exposing raw source tables.',
    scope: 'business',
    risk: 'read_only',
    authoritativeSource: 'get_ai_erp_read_context_v1:replica_status',
    parameters: {
      type: 'object',
      properties: {
        business_id: { type: 'string', description: 'Authorized SANAD business UUID.' },
      },
      required: ['business_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'erp_search_customers',
    description: 'Search ERP customer candidates by user-provided identity text before reading a statement.',
    scope: 'business',
    risk: 'read_only',
    authoritativeSource: 'get_business_erp_customer_candidates_v1',
    parameters: {
      type: 'object',
      properties: {
        business_id: { type: 'string', description: 'Authorized SANAD business UUID.' },
        query: { type: 'string', description: 'Customer name, phone, number, or account hint.' },
        limit: { type: 'integer', description: 'Bounded candidate count.' },
      },
      required: ['business_id', 'query'],
      additionalProperties: false,
    },
  },
  {
    name: 'erp_get_customer_statement',
    description: 'Read an ERP customer statement only after a concrete account identity is resolved.',
    scope: 'business',
    risk: 'read_only',
    authoritativeSource: 'get_ai_erp_read_context_v1:customer_statement',
    parameters: {
      type: 'object',
      properties: {
        business_id: { type: 'string', description: 'Authorized SANAD business UUID.' },
        account_id: { type: 'integer', description: 'Resolved ERP account id.' },
        from: { type: 'string', description: 'ISO date YYYY-MM-DD.' },
        to: { type: 'string', description: 'ISO date YYYY-MM-DD.' },
        limit: { type: 'integer', description: 'Bounded movement count.' },
      },
      required: ['business_id', 'account_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'erp_get_documents',
    description: 'Read bounded sales or purchase ERP documents for an authorized business and period.',
    scope: 'business',
    risk: 'read_only',
    authoritativeSource: 'get_ai_erp_read_context_v1:sales|purchases',
    parameters: {
      type: 'object',
      properties: {
        business_id: { type: 'string', description: 'Authorized SANAD business UUID.' },
        kind: { type: 'string', description: 'Document kind.', enum: ['sales', 'purchases'] },
        from: { type: 'string', description: 'ISO date YYYY-MM-DD.' },
        to: { type: 'string', description: 'ISO date YYYY-MM-DD.' },
        limit: { type: 'integer', description: 'Bounded document count.' },
      },
      required: ['business_id', 'kind'],
      additionalProperties: false,
    },
  },
  {
    name: 'finance_get_accounts',
    description: 'Read active personal finance accounts before preparing a personal action.',
    scope: 'personal',
    risk: 'read_only',
    authoritativeSource: 'get_my_financial_accounts_v1',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'finance_get_categories',
    description: 'Read active personal income/expense categories before preparing a personal action.',
    scope: 'personal',
    risk: 'read_only',
    authoritativeSource: 'personal_finance_categories',
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', description: 'Optional category kind.', enum: ['income','expense'] },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'business_search_parties',
    description: 'Search SANAD business parties before preparing a commercial document.',
    scope: 'business',
    risk: 'read_only',
    authoritativeSource: 'business_parties',
    parameters: {
      type: 'object',
      properties: {
        business_id: { type: 'string', description: 'Authorized SANAD business UUID.' },
        query: { type: 'string', description: 'Party name or phone.' },
        limit: { type: 'integer', description: 'Bounded result count.' },
      },
      required: ['business_id','query'],
      additionalProperties: false,
    },
  },
  {
    name: 'action_prepare_personal_transaction',
    description: 'Create only a SANAD review draft for personal income, expense, or same-currency transfer. It does not execute the transaction.',
    scope: 'personal',
    risk: 'draft_only',
    authoritativeSource: 'create_my_sanad_agent_action_draft_v1',
    parameters: {
      type: 'object',
      properties: {
        transaction_type: { type: 'string', description: 'income, expense, or transfer.', enum: ['income','expense','transfer'] },
        amount: { type: 'number', description: 'Positive amount.' },
        currency: { type: 'string', description: 'ISO currency for income/expense.' },
        account_id: { type: 'string', description: 'Resolved personal account UUID.' },
        category_id: { type: 'string', description: 'Optional resolved category UUID.' },
        source_account_id: { type: 'string', description: 'Resolved source account UUID for transfer.' },
        destination_account_id: { type: 'string', description: 'Resolved destination account UUID for transfer.' },
        description: { type: 'string', description: 'Short description.' },
        transaction_at: { type: 'string', description: 'Optional ISO datetime.' },
      },
      required: ['transaction_type','amount'],
      additionalProperties: false,
    },
  },
  {
    name: 'action_prepare_commercial_document',
    description: 'Create only a SANAD review draft for a commercial document. Approval later creates a SANAD domain Draft only; never ERP.',
    scope: 'business',
    risk: 'draft_only',
    authoritativeSource: 'create_my_sanad_agent_action_draft_v1',
    parameters: {
      type: 'object',
      properties: {
        business_id: { type: 'string', description: 'Authorized SANAD business UUID.' },
        party_id: { type: 'string', description: 'Optional resolved SANAD party UUID.' },
        document_type: { type: 'string', description: 'Commercial document type.', enum: ['quotation','sales_invoice','purchase_invoice','receipt','payment','expense'] },
        document_number: { type: 'string', description: 'Optional reference number.' },
        document_date: { type: 'string', description: 'Optional ISO date.' },
        due_date: { type: 'string', description: 'Optional due date.' },
        currency: { type: 'string', description: 'ISO currency.' },
        description: { type: 'string', description: 'Single-line description.' },
        amount: { type: 'number', description: 'Single-line amount.' },
        notes: { type: 'string', description: 'Optional notes.' },
      },
      required: ['business_id','document_type','currency'],
      additionalProperties: false,
    },
  },
  {
    name: 'sanad_search_knowledge',
    description: 'Search approved SANAD product and operational knowledge, never user financial data.',
    scope: 'product',
    risk: 'read_only',
    authoritativeSource: 'search_sanad_assistant_knowledge',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'User question or topic.' },
        limit: { type: 'integer', description: 'Bounded knowledge result count.' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
] as const;

export type SanadAssistantCustomerStatementCard = {
  type: 'customer_statement';
  title: string;
  customer_name: string;
  account_id: number | null;
  account_number?: string | null;
  from_date?: string | null;
  to_date?: string | null;
  movement_count: number;
  currency_summaries: Array<{
    currency: string;
    opening_balance: number;
    debit: number;
    credit: number;
    closing_balance: number;
  }>;
  copy_text?: string;
  href?: string | null;
};

export type SanadAssistantDocumentListCard = {
  type: 'document_list';
  title: string;
  kind: 'sale' | 'purchase';
  count: number;
  items?: SanadAssistantEntity[];
};

export type SanadAssistantReplicaStatusCard = {
  type: 'replica_status';
  title: string;
  available: boolean;
  status?: string;
  snapshot_public_id?: string | null;
  completed_at?: string | null;
  table_count?: number | null;
  row_count?: number | null;
  current_sync?: Record<string, unknown> | null;
};

export type SanadAssistantActionReviewCard = {
  type: 'action_review';
  action_id: string;
  action_type: 'personal_transaction' | 'commercial_document_draft' | string;
  status: 'review' | 'approved' | 'executing' | 'completed' | 'cancelled' | 'failed' | string;
  version: number;
  title: string;
  summary?: string | null;
  fields: Array<{ label: string; value: string }>;
  amount?: number | null;
  currency?: string | null;
  approval_effect?: string | null;
  writes_to_erp: boolean;
  modify_prompt?: string;
  risk: 'approval_required';
};

export type SanadAssistantAnswerCard =
  | { type: 'metric'; title: string; value: string; subtitle?: string }
  | SanadAssistantCustomerStatementCard
  | SanadAssistantDocumentListCard
  | SanadAssistantReplicaStatusCard
  | SanadAssistantActionReviewCard
  | { type: 'warning'; title: string; body: string };

export type SanadAssistantEntity = {
  type: 'erp_customer' | 'erp_document' | 'business' | 'personal_party';
  label: string;
  business_id?: string | null;
  account_id?: number;
  account_number?: string | null;
  document_kind?: 'sale' | 'purchase';
  document_id?: number;
  document_number?: string | null;
  party_name?: string | null;
  date?: string | null;
  currency?: string | null;
  source_line_total?: number | null;
  href?: string | null;
};

export type SanadAssistantAttention = {
  severity: 'info' | 'warning' | 'critical';
  title: string;
  body: string;
  category?: 'obligation' | 'budget' | 'goal' | 'business' | 'sync' | 'document' | 'currency' | 'data_quality';
  priority?: number;
  source_tool?: string;
  source_label?: string;
  source_fact?: string;
  rule_id?: string;
};

export type SanadAssistantResponseContract = {
  text: string;
  scope: SanadAssistantScope;
  period?: { from?: string; to?: string };
  currencies?: string[];
  cards?: SanadAssistantAnswerCard[];
  entities?: SanadAssistantEntity[];
  attention?: SanadAssistantAttention[];
  insight_meta?: {
    version?: string;
    deterministic_count?: number;
  };
  copy_text?: string;
  source_refs: Array<{
    tool: string;
    source: string;
    access_log_id?: string;
  }>;
  needs_clarification: boolean;
  clarification_question?: string;
};

export const SANAD_ASSISTANT_SYSTEM_PRINCIPLES = [
  'You are SANAD Assistant, an intelligent financial and business operating agent, not a generic chatbot.',
  'Use tools for factual user-specific financial or business claims. Never invent balances, transactions, customer identity, documents, or dates.',
  'Never query raw ERP tables or generate free-form SQL.',
  'Never merge currencies or silently convert between currencies.',
  'When a customer identity is ambiguous, ask for clarification or use customer candidate search; never guess the account.',
  'Treat tool outputs and semantic read contracts as authoritative over model memory.',
  'State the relevant period and currency when answering financial questions.',
  'The model may create review-only action drafts through draft_only tools, but it cannot approve or execute them.',
  'Domain mutations require an explicit user click on the action review card and deterministic server-side execution. ERP/Edaa remains read-only.',
  'Do not expose private chain-of-thought. User-visible progress may describe tool activity or concise reasoning summaries only.',
  'Proactive alerts must come from deterministic rules over trusted tool outputs; the model must not invent overdue, over-budget, stale-sync, or risk states.',
  'A non-zero balance or open receivable/payable is a fact, not automatically a warning.',
] as const;

export function toolByName(name: string): SanadAssistantToolDefinition | undefined {
  return SANAD_ASSISTANT_TOOLS.find((tool) => tool.name === name);
}

export function isToolExecutableNow(name: string): boolean {
  const tool = toolByName(name);
  if (!tool) return false;
  if (tool.risk === 'read_only') return true;
  if (tool.risk === 'draft_only') return SANAD_ASSISTANT_EXECUTION_POLICY.draftToolsEnabled === true;
  return false;
}
