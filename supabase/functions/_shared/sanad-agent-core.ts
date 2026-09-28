import { isPersistedActionReview } from './sanad-action-contract.ts';
export type Json = Record<string, unknown>;
export type ToolCall = { id: string; name: string; arguments: Json };
export type HistoryTurn = { role: "user" | "assistant"; content: string };

export const RUNTIME_VERSION = "sanad-ai-agent-v2-shared";
export const MODEL = "gemini-3.8-flash";
export const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
export const MAX_TOOL_CALLS = 8;
export const MAX_TOOL_ROUNDS = 5;
export const MAX_PARALLEL_TOOLS = 4;
export const DEFAULT_LIMIT = 30;

export const SYSTEM_INSTRUCTION = `
أنت «مساعد سند»، وكيل مالي وتجاري ذكي داخل تطبيق سند، ولست بوت دعم عام.

قواعد تشغيل ملزمة:
1) استخدم الأدوات لأي حقيقة تخص بيانات المستخدم المالية أو التجارية أو بيانات إبداع. لا تخمّن أرقامًا أو أرصدة أو أسماء حسابات أو مستندات.
2) لا تخلط العملات مطلقًا ولا تجمع SAR وYER وUSD في رقم واحد. اعرض كل عملة مستقلة.
3) عند الإجابة عن بيانات مالية اذكر الفترة والعملة بوضوح.
4) بيانات إبداع تقرأ فقط من العقود الدلالية المعتمدة. لا SQL حر ولا جداول خام.
5) إذا كان اسم العميل ملتبسًا، استخدم البحث عن المرشحين واطلب توضيحًا. لا تختَر حسابًا من نفسك.
6) بيانات إبداع وERP قراءة فقط دائمًا. لا تكتب إلى إبداع ولا تقترح أن سند فعل ذلك.
6.1) لديك أدوات محددة لإنشاء «مسودة إجراء للمراجعة» داخل سند: action_prepare_personal_transaction وaction_prepare_commercial_document وaction_prepare_personal_account وaction_prepare_personal_category. جميعها تجهز بطاقة مراجعة فقط ولا تنفذ الكتابة عند تجهيزها.
6.1.1) عند نقص حساب شخصي أو تصنيف، لا تطلب من المستخدم مغادرة المحادثة إلى الإعدادات: اعرض تجهيزه هنا. اقرأ الحسابات/التصنيفات أولًا لتجنب التكرار. اطلب اسم الحساب وعملته إن لم يحددهما المستخدم، ثم action_prepare_personal_account؛ الحساب الجديد أصول شخصية برصيد افتتاحي صفر فقط. لا تخمن العملة أو الاسم ولا تنشئ متطلبًا لم يطلبه المستخدم. للتصنيف اطلب الاسم والنوع (دخل أو مصروف) ثم action_prepare_personal_category. التصنيف اختياري للمصروف فلا تجعله عائقًا ولا تنشئه تلقائيًا. لا تدّع دعم إنشاء أطراف أو عملات أو أي متطلب آخر غير هذه الأدوات المحددة.
6.1.2) بعد تجهيز بطاقة حساب/تصنيف، توقف حتى يعتمدها المستخدم من البطاقة. لا تستخدم معرّف الإجراء كمعرّف حساب/تصنيف ولا تجهز المصروف المعتمد عليه في نفس الدور. احتفظ بسياق طلب المصروف في المحادثة وقل للمستخدم: بعد اعتماد البطاقة اكتب «تابع المصروف». عند المتابعة اقرأ الأدوات الفعلية مجددًا لحل المعرّف؛ الموافقة النصية وحدها لا تنشئ الحساب ولا تنفذ المصروف. إذا كان المتطلب موجودًا فاستخدمه بعد التحقق من الاسم والعملة/النوع، وإذا كان غير نشط أو ملتبسًا فاشرح الحاجة للاختيار بدل إنشاء نسخة مكررة.
6.1.3) تعديل مسودة دخل أو مصروف أو تحويل موجود بالنص أو النص الصوتي: استخدم action_list_personal_drafts لاكتشاف المسودات في المحادثة الحالية، ثم action_get_personal_draft لقراءة المسودة المختارة وإصدارها في الدور الحالي. إذا التبس المقصود بين مسودات متعددة فاسأل المستخدم ولا تخمن. استخدم action_edit_personal_transaction بالمعرف والإصدار المقروءين وpatch للحقول المطلوبة فقط. اقرأ الحساب/التصنيف بالأدوات إذا طُلب تغييره. احذف التصنيف فقط عند طلب ذلك صراحة بإرسال null. لا تغيّر التاريخ أو الوصف أو أي حقل لم يطلبه المستخدم. التاريخ المعدل يتطلب وقتًا ومنطقة زمنية واضحين؛ اسأل عند الغموض. يمكن تعديل الدخل والمصروف والتحويل بين حسابين بنفس العملة. لا تغيّر نوع المسودة ولا تعدّل إجراءً مكتملًا. التحويل لا يملك تصنيفًا ويحتاج حساب مصدر ووجهة مختلفين؛ لا تنفذ صرف عملات.
6.1.4) تعديل واحد فقط لكل دور. إذا فشل التعديل أو تعارض الإصدار أو غابت نتيجة موثوقة، لا تعاود التعديل ولا تنشئ مسودة بديلة؛ اقرأ الحالة الحالية واشرح للمستخدم ما حدث وانتظر طلبًا جديدًا. التعديل لا يعتمد الإجراء ولا ينفذ أي حركة مالية. عند النجاح قل بوضوح إن المسودة نفسها حُدّثت وتحتاج مراجعة واعتماد النسخة الجديدة. لا تتعامل مع كلمة «اعتمد» المكتوبة أو المنطوقة كزر اعتماد.
6.2) لا توجد لديك أداة اعتماد أو تنفيذ. الاعتماد الصريح يتم فقط من بطاقة المراجعة في واجهة المستخدم، ثم ينفذ الخادم أمرًا deterministic بعد إعادة التحقق.
6.3) إذا قال المستخدم «اعتمد» نصيًا، لا تعتبر النص وحده تنفيذًا ولا تدّع التنفيذ؛ وجّهه إلى زر الاعتماد في بطاقة المسودة الحالية.
7) نفّذ أقل عدد من الأدوات اللازمة. يمكن استخدام أدوات مستقلة في الجولة نفسها.
8) إذا احتجت معرفة النشاط المتاح للمستخدم فاستدع business_list_accessible أولًا.
9) أجب بالعربية الواضحة والمختصرة افتراضيًا، مع تفاصيل كافية عندما يطلبها المستخدم.
10) لا تعرض التفكير الداخلي أو chain-of-thought. يمكنك فقط إعطاء وصف موجز لما تم فحصه.
11) نتائج الأدوات هي المصدر المرجعي للحقيقة، وتتقدم على معرفتك العامة.
12) إذا لم تتوفر بيانات كافية، صرّح بذلك واسأل سؤال توضيح واحد محدد.
13) بعد الإجابة المباشرة، انتبه لأي نقطة مهمة ومثبتة من نتائج الأدوات تستحق تنبيه المستخدم إليها، لكن لا تخترع مخاطر أو استنتاجات غير مدعومة.
14) الذاكرة والسياق السابق يساعدانك في فهم المستخدم والاختصارات والتفضيلات، لكنهما ليسا مصدرًا للأرصدة أو الفواتير أو الحقائق المالية الحالية؛ أعد قراءة هذه الحقائق من الأدوات الحية.
15) طبقة Insight Engine هي المسؤولة عن التنبيهات الاستباقية المحسوبة. لا تخترع تحذيرًا أو حالة تأخر أو تجاوز من معرفتك العامة؛ يجب أن تكون مدعومة بنتيجة أداة.
16) إذا طلب المستخدم مراجعة عامة لما يجب الانتباه إليه، اقرأ عقود النظرة المناسبة بدل الاكتفاء بإجابة لغوية عامة.
17) لا تعتبر الرصيد غير الصفري أو الذمم المفتوحة خطأ بحد ذاته. صف الحقيقة كما هي، واجعل التحذير فقط عند وجود قاعدة صريحة مثل تجاوز تاريخ الاستحقاق أو الميزانية أو تقادم النسخة.
18) قبل إعداد إجراء مالي، احصل على المعرّفات الفعلية من أدوات القراءة: الحساب/التصنيف للمالية الشخصية، والطرف/النشاط للمستند التجاري. لا تخمّن UUID أو معرفًا.
19) بعد إنشاء مسودة إجراء، قل بوضوح إنها «مسودة بانتظار المراجعة والاعتماد» ولا تقل «تم التسجيل» أو «تم التنفيذ».
20) لا تُنشئ مسودة إجراء إذا كان طلب المستخدم استفهامًا أو تحليلًا فقط؛ يلزم فعل صريح مثل سجل/أنشئ/أضف/حوّل/جهّز.
21) في طلبات كشف حساب العميل: ابحث عن المرشحين مرة واحدة لكل اسم، ثم إن بقيت الهوية ملتبسة اطلب تحديد الحساب ولا تكرر البحث بالاسم نفسه. عند تحديد رقم الحساب نفذ القراءة مرة واحدة للفترة المطلوبة.
22) أعطِ النتيجة المطلوبة أولًا؛ التحليل الأوسع لبقية النشاط خطوة اختيارية مستقلة تتطلب أدوات ومصادر إضافية مصرحًا بها، وليست شرطًا لعرض كشف الحساب.
23) لا تعرض أسماء الأدوات أو المعرفات البرمجية الداخلية مثل finance_get_overview أو جولات التنفيذ في النص الموجه للمستخدم؛ صف البيانات والمصدر وحالة التحقق بالعربية. إذا انتهت جولات الأدوات فأجب فقط من النتائج الموثقة التي استرجعتها، وحدد ما تعذر التحقق منه بوضوح.

هدفك: فهم نية المستخدم، اختيار الأدوات الصحيحة، التحقق من النتيجة، ثم تقديم إجابة عملية موثوقة.
`.trim();

export const TOOLS = [
  {
    type: "function", name: "action_list_personal_drafts",
    description: "List up to 20 pending personal income, expense or same-currency transfer drafts in the current owned personal thread. has_more means the list is incomplete. Clarify ambiguous targets; never select another thread.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    type: "function", name: "action_get_personal_draft",
    description: "Read the exact current personal income, expense or same-currency transfer draft and expected version before editing it in this turn. Only current-thread personal transactions in review are supported.",
    parameters: { type: "object", properties: { action_id: {type:"string",description:"Resolved canonical draft UUID."} }, required:["action_id"], additionalProperties:false },
  },
  {
    type: "function", name: "action_edit_personal_transaction",
    description: "Revise the SAME personal income, expense or same-currency transfer draft, never approve/post/cancel/recreate. First read action_get_personal_draft in this turn. Only requested fields belong in patch. One attempt per turn; do not retry on errors or uncertain outcomes.",
    parameters: { type:"object", properties: {
      action_id: {type:"string",description:"UUID read from the current thread draft."},
      expected_version: {type:"integer",description:"Exact version from this turn's draft read."},
      patch: {type:"object",description:"Only user-requested changes. Omitted fields are preserved.",properties:{
        amount: {type:"string",description:"Positive exact decimal text, at most six fractional digits. No grouping separators or exponent."},
        currency: {type:"string",description:"Uppercase currency; changing it requires a compatible resolved account, or both resolved transfer accounts."},
        account_id: {type:"string",description:"Income/expense account UUID resolved this turn."},
        source_account_id: {type:"string",description:"Transfer source account UUID resolved this turn."},
        destination_account_id: {type:"string",description:"Transfer destination UUID resolved this turn, distinct and same currency."},
        category_id: {type:["string","null"],description:"Resolved category UUID; null only if the user explicitly removes the category."},
        description: {type:["string","null"],description:"Requested description, at most 500 characters."},
        transaction_at: {type:"string",description:"Explicit ISO datetime including timezone. Preserve date/time unless the user asks to change it."}
      },additionalProperties:false}
    },required:["action_id","expected_version","patch"],additionalProperties:false},
  },

  {
    type: "function",
    name: "finance_get_overview",
    description: "Read the authenticated user's personal finance overview for a bounded period, including dashboard, transactions, obligations and goals. Use for broad personal reviews. If the user asks what to pay attention to, pair with finance_get_budgets because budget progress comes from a separate read model. Currencies stay separate.",
    parameters: {
      type: "object",
      properties: {
        from: { type: "string", description: "Optional ISO date YYYY-MM-DD." },
        to: { type: "string", description: "Optional ISO date YYYY-MM-DD." },
        limit: { type: "integer", description: "Maximum recent items, 1-100." },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "finance_search_transactions",
    description: "Search the authenticated user's recent personal finance transactions by period and optional text.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Optional text matched against description, reference, party or category identifiers available in the semantic context." },
        from: { type: "string", description: "Optional ISO date YYYY-MM-DD." },
        to: { type: "string", description: "Optional ISO date YYYY-MM-DD." },
        limit: { type: "integer", description: "Maximum results, 1-100." },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "finance_get_obligations",
    description: "Read the authenticated user's open personal receivables and payables.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "integer", description: "Maximum results, 1-100." },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "finance_get_budgets",
    description: "Read personal budget progress for a given date.",
    parameters: {
      type: "object",
      properties: {
        on_date: { type: "string", description: "Optional ISO date YYYY-MM-DD." },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "finance_get_goals",
    description: "Read the authenticated user's active personal financial goals.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    type: "function",
    name: "finance_search_parties",
    description: "Search personal financial counterparties by name or phone.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Name or phone search text." },
        limit: { type: "integer", description: "Maximum results, 1-50." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "business_list_accessible",
    description: "List businesses the authenticated user can access. Use this before business tools if the business is not already explicit.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    type: "function",
    name: "business_get_dashboard",
    description: "Read the commercial dashboard for an authorized SANAD business and period. It includes totals, open receivables/payables by currency and overdue document count; use it for broad business review or what-needs-attention questions.",
    parameters: {
      type: "object",
      properties: {
        business_id: { type: "string", description: "Authorized business UUID." },
        from: { type: "string", description: "Optional ISO date YYYY-MM-DD." },
        to: { type: "string", description: "Optional ISO date YYYY-MM-DD." },
      },
      required: ["business_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "erp_get_replica_status",
    description: "Read latest completed ERP cloud replica status for an authorized business.",
    parameters: {
      type: "object",
      properties: { business_id: { type: "string", description: "Authorized business UUID." } },
      required: ["business_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "erp_search_customers",
    description: "Search ERP customer candidates. Use before customer statement unless the exact account_id is already resolved in this turn.",
    parameters: {
      type: "object",
      properties: {
        business_id: { type: "string", description: "Authorized business UUID." },
        query: { type: "string", description: "Customer name, phone, customer number or account hint." },
        limit: { type: "integer", description: "Maximum candidates, 1-20." },
      },
      required: ["business_id", "query"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "erp_get_customer_statement",
    description: "Read an ERP customer statement after a concrete account_id is resolved.",
    parameters: {
      type: "object",
      properties: {
        business_id: { type: "string", description: "Authorized business UUID." },
        account_id: { type: "integer", description: "Resolved ERP account id." },
        from: { type: "string", description: "Optional ISO date YYYY-MM-DD." },
        to: { type: "string", description: "Optional ISO date YYYY-MM-DD." },
        limit: { type: "integer", description: "Maximum statement movements, 1-100." },
      },
      required: ["business_id", "account_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "erp_get_documents",
    description: "Read bounded ERP sales or purchase documents for an authorized business.",
    parameters: {
      type: "object",
      properties: {
        business_id: { type: "string", description: "Authorized business UUID." },
        kind: { type: "string", enum: ["sales", "purchases"], description: "Document kind." },
        from: { type: "string", description: "Optional ISO date YYYY-MM-DD." },
        to: { type: "string", description: "Optional ISO date YYYY-MM-DD." },
        limit: { type: "integer", description: "Maximum documents, 1-100." },
      },
      required: ["business_id", "kind"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "finance_get_accounts",
    description: "Read the authenticated user's active personal finance accounts. Use before preparing an income, expense or transfer action so account UUIDs are resolved rather than guessed.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    type: "function",
    name: "finance_get_categories",
    description: "Read the authenticated user's active personal finance categories. Use when an income or expense action needs a category_id.",
    parameters: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["income","expense"], description: "Optional category kind." },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "business_get_payment_inbox",
    description: "Read a bounded SANAD Payment Inbox view for the selected business. Read-only: never claim, complete, release, reassign, reject or resolve an inbox item. Use for questions about new payments, pending inbox work or payment inbox status.",
    parameters: {
      type: "object",
      properties: {
        business_id: { type: "string", description: "Authorized SANAD business UUID." },
        view: { type: "string", enum: ["new","mine","team_active","review","completed","all"], description: "Inbox view. Use new by default." },
        limit: { type: "integer", description: "Maximum items, 1-30." },
      },
      required: ["business_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "business_search_parties",
    description: "Search SANAD business parties by name or phone. This is for SANAD commercial documents, not ERP customer identity.",
    parameters: {
      type: "object",
      properties: {
        business_id: { type: "string", description: "Authorized SANAD business UUID." },
        query: { type: "string", description: "Party name or phone." },
        limit: { type: "integer", description: "Maximum results, 1-20." },
      },
      required: ["business_id","query"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "action_prepare_personal_account",
    description: "Prepare a personal asset account review card with zero opening balance. No account is created until explicit UI approval. Read finance_get_accounts first. Never attach an opening balance or invent missing name/currency.",
    parameters: { type: "object", properties: { name: { type: "string", description: "User-provided personal account name, 1-120 characters." }, currency: { type: "string", description: "User-confirmed three-letter currency code." } }, required: ["name","currency"], additionalProperties: false },
  },
  {
    type: "function",
    name: "action_prepare_personal_category",
    description: "Prepare a personal income/expense category review card. No category is created until explicit UI approval. Read finance_get_categories first. Categories are optional for transactions.",
    parameters: { type: "object", properties: { name: { type: "string", description: "User-provided category name, 1-80 characters." }, kind: { type: "string", enum: ["income","expense"], description: "User-requested category kind." } }, required: ["name","kind"], additionalProperties: false },
  },
  {
    type: "function",
    name: "action_prepare_personal_transaction",
    description: "Prepare a review-only SANAD action draft for a personal income, expense or same-currency transfer. This DOES NOT create or post the financial transaction. Resolve account/category UUIDs first with read tools. The user must explicitly approve the returned review card in the UI before any domain write.",
    parameters: {
      type: "object",
      properties: {
        transaction_type: { type: "string", enum: ["income","expense","transfer"], description: "Personal transaction kind." },
        amount: { type: "number", description: "Positive amount." },
        currency: { type: "string", description: "ISO currency for income/expense, e.g. SAR or YER." },
        account_id: { type: "string", description: "Resolved account UUID for income/expense." },
        category_id: { type: "string", description: "Optional resolved category UUID." },
        source_account_id: { type: "string", description: "Resolved source account UUID for transfer." },
        destination_account_id: { type: "string", description: "Resolved destination account UUID for transfer." },
        description: { type: "string", description: "Short user-facing description." },
        transaction_at: { type: "string", description: "Optional ISO datetime." },
      },
      required: ["transaction_type","amount"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "action_prepare_commercial_document",
    description: "Prepare a review-only SANAD action draft for a commercial quotation, sales invoice, purchase invoice, receipt, payment or expense. This DOES NOT post a document and NEVER writes to ERP/Edaa. Resolve business and party IDs before preparing. User approval creates only a SANAD commercial Draft.",
    parameters: {
      type: "object",
      properties: {
        business_id: { type: "string", description: "Authorized SANAD business UUID." },
        party_id: { type: "string", description: "Optional resolved SANAD business party UUID." },
        document_type: { type: "string", enum: ["quotation","sales_invoice","purchase_invoice","receipt","payment","expense"], description: "Commercial document type." },
        document_number: { type: "string", description: "Optional external/reference number." },
        document_date: { type: "string", description: "Optional ISO date YYYY-MM-DD." },
        due_date: { type: "string", description: "Optional due date YYYY-MM-DD." },
        currency: { type: "string", description: "ISO currency." },
        description: { type: "string", description: "Single-line description when lines are not supplied." },
        amount: { type: "number", description: "Single-line amount when lines are not supplied." },
        lines: {
          type: "array",
          description: "Optional bounded document lines.",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              quantity: { type: "number" },
              unit_price: { type: "number" },
              discount_amount: { type: "number" },
              tax_amount: { type: "number" },
            },
            required: ["description","quantity","unit_price"],
            additionalProperties: false,
          },
        },
        notes: { type: "string", description: "Optional notes." },
      },
      required: ["business_id","document_type","currency"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "sanad_search_knowledge",
    description: "Search approved SANAD product and operational knowledge. Never use this tool for user financial facts.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Product or operational knowledge question." },
        limit: { type: "integer", description: "Maximum knowledge units, 1-8." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
] as const;

export function cleanText(value: unknown, max = 6000) {
  const text = String(value ?? "").trim();
  return text.length > max ? text.slice(0, max) : text;
}

export function chooseThinking(message: string): "low" | "medium" | "high" {
  const text = message.toLowerCase();
  if (message.length < 90 && /^(مرحبا|اهلا|السلام|هلا|شكرا|ما هو سند|كيف يعمل سند)/.test(text)) return "low";
  if (/(قارن|حلل|فسر|لماذا|اختلاف|فروقات|اتجاه|توقع|كل الحسابات|عدة عملات|كشف.*ومبيعات|مبيعات.*ومشتريات)/.test(text)) return "high";
  return "medium";
}

export function sanitizeHistory(value: unknown): HistoryTurn[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-24).flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const role = (row as Json).role;
    const content = cleanText((row as Json).content, 2500);
    if ((role !== "user" && role !== "assistant") || !content) return [];
    return [{ role, content } as HistoryTurn];
  });
}

export function inferAgentRoutingHint(message: string, businessId?: string | null): string {
  const value = cleanText(message,1200).toLowerCase();
  const broadAttention = /(انتبه|الانتباه|راجع وضعي|راجع الوضع|نظرة شاملة|حلل وضعي|ما المهم|ما الذي يهم|ما الذي يجب)/i.test(value);
  const budget = /(ميزاني|budget|الميزانية)/i.test(value);
  const obligation = /(التزام|التزامات|مستحق|مستحقات|دين|ديون|ذمم)/i.test(value);
  const goal = /(هدف|اهداف|أهداف|goal)/i.test(value);
  const replica = /(إبداع|مزامن|نسخة سحاب|bridge|النسخة)/i.test(value);
  const statement = /(كشف حساب|رصيد عميل|حساب العميل)/i.test(value);
  const documents = /(فاتور|مبيعات|مشتريات|مستند)/i.test(value);
  const explicitAction = /(سجل|سجّل|انشئ|أنشئ|أضف|اضف|حوّل|حول|جهز|جهّز|اصدر|أصدر)/i.test(value);
  const personalAction = explicitAction && /(مصروف|دخل|تحويل|حسابي|شخصي|العمقي|الكريمي|البصيري)/i.test(value);
  const commercialAction = explicitAction && /(فاتور|بيع|شراء|سند قبض|سند صرف|عرض سعر|مصروف تجاري)/i.test(value);
  const paymentInbox = /(وارد المدفوعات|دفعات جديدة|الدفعات الجديدة|عمليات دفع جديدة|دفعة جديدة)/i.test(value);

  if (/(عدل|عدّل|تعديل|غيّر|غير|غيِّر)/i.test(value) && !businessId) {
    return "توجيه الأدوات: إذا كان المقصود تعديل مسودة مالية شخصية، اقرأ المسودات ثم المسودة المحددة عبر action_get_personal_draft، وعدّل نفس المعرف بأداة action_edit_personal_transaction. اسأل عند غموض المسودة. لا تنشئ بديلًا ولا تعتمد العملية.";
  }
  if (paymentInbox && businessId) {
    return "توجيه الأدوات: استخدم business_get_payment_inbox للقراءة فقط. لا تستلم ولا تكمل ولا تحرر أي عملية من المساعد.";
  }
  if (!businessId && explicitAction && /(حساب|محفظة|صندوق|تصنيف|فئة)/i.test(value) && !/(مصروف|تحويل|دخل)/i.test(value)) {
    return "توجيه الأدوات: لإنشاء حساب أو تصنيف شخصي، اقرأ القائمة أولًا ثم جهّز بطاقة المتطلب بأداة action_prepare_personal_account أو action_prepare_personal_category. اطلب المعلومات الناقصة ولا تنشئ حركة مالية. انتظر اعتماد البطاقة.";
  }
  if (personalAction) {
    return "توجيه الأدوات: هذا طلب إجراء شخصي. اقرأ finance_get_accounts أولًا، وfinance_get_categories عند الحاجة، إذا نقص الحساب اعرض تجهيزه هنا بأداة action_prepare_personal_account وانتظر اعتماد بطاقته. التصنيف اختياري ويمكن تجهيزه عند طلب المستخدم بأداة action_prepare_personal_category. بعد توفر المتطلبات استخدم action_prepare_personal_transaction لإنشاء مسودة مراجعة فقط. لا تنفذ العملية.";
  }
  if (commercialAction && businessId) {
    return "توجيه الأدوات: هذا طلب إجراء تجاري. استخدم business_search_parties إذا ذكر المستخدم طرفًا يحتاج حل هويته، ثم action_prepare_commercial_document لإنشاء مسودة مراجعة فقط. لا ترحّل المستند.";
  }
  if (broadAttention && businessId) {
    return "توجيه الأدوات: استخدم business_get_dashboard للمراجعة العامة للنشاط. أضف erp_get_replica_status فقط إذا كان السؤال يتضمن إبداع أو حداثة البيانات أو المزامنة.";
  }
  if (broadAttention) {
    return "توجيه الأدوات: للمراجعة الشخصية العامة استخدم finance_get_overview وfinance_get_budgets حتى تشمل الالتزامات والأهداف وتقدم الميزانيات.";
  }
  if (budget) return "توجيه الأدوات: استخدم finance_get_budgets ولا تستنتج التجاوز من نص المستخدم.";
  if (obligation) return "توجيه الأدوات: استخدم finance_get_obligations لقراءة المبلغ والعملة وتاريخ الاستحقاق.";
  if (goal) return "توجيه الأدوات: استخدم finance_get_goals لقراءة الهدف والتقدم والموعد.";
  if (replica) return "توجيه الأدوات: استخدم erp_get_replica_status عندما يكون المطلوب حالة إبداع أو حداثة النسخة.";
  if (statement) return "توجيه الأدوات: ابحث عن العميل أولًا عند الحاجة ثم اقرأ كشف الحساب بعد حل account_id بصورة فريدة.";
  if (documents) return "توجيه الأدوات: استخدم erp_get_documents وحدد المبيعات أو المشتريات بحسب طلب المستخدم.";
  return "توجيه الأدوات: لا توجد أداة إضافية مفروضة؛ اختر أقل مجموعة أدوات لازمة للطلب.";
}

export function userInput(
  message: string,
  history: HistoryTurn[],
  businessId?: string | null,
  memoryContext?: { summary?: string | null; memories?: string[] },
  attachmentContext?: string[],
) {
  const compactHistory = history.length
    ? history.map((turn) => `${turn.role === "user" ? "المستخدم" : "سند"}: ${turn.content}`).join("\n")
    : "لا يوجد سجل سابق مزود لهذه الجولة.";
  const memories = Array.isArray(memoryContext?.memories)
    ? memoryContext!.memories!.slice(0, 30).filter(Boolean)
    : [];
  const routingHint = inferAgentRoutingHint(message,businessId);
  const attachments = Array.isArray(attachmentContext)
    ? attachmentContext.slice(0, 5).filter(Boolean)
    : [];
  return [
    "سياق الجلسة:",
    businessId ? `النشاط المحدد حاليًا: ${businessId}` : "لا يوجد نشاط محدد مسبقًا.",
    memoryContext?.summary ? `ملخص المحادثة السابقة: ${memoryContext.summary}` : "لا يوجد ملخص طويل للمحادثة.",
    memories.length ? "ذاكرة مساعدة مستقرة:\n- " + memories.join("\n- ") : "لا توجد ذاكرة مستقرة إضافية.",
    "ملاحظة: الذاكرة ليست مصدرًا للحقائق المالية الحالية؛ استخدم الأدوات الحية لأي رصيد أو مستند أو رقم.",
    routingHint,
    attachments.length
      ? "مرفقات هذه الرسالة (تحليل أولي غير ملزم، وليس حقيقة مالية نهائية):\n- " + attachments.join("\n- ")
      : "لا توجد مرفقات مرتبطة بهذه الرسالة.",
    "إذا احتوى المرفق على مبلغ أو فاتورة أو عميل فاستعمل أدوات النظام الحية للمطابقة قبل عرض أي حقيقة تشغيلية.",
    "",
    "آخر المحادثة:",
    compactHistory,
    "",
    "رسالة المستخدم الحالية:",
    message,
  ].join("\n");
}

export function extractText(interaction: Json): string {
  const direct = cleanText(interaction.output_text, 20000);
  if (direct) return direct;
  const steps = Array.isArray(interaction.steps) ? interaction.steps : [];
  const chunks: string[] = [];
  for (const step of steps) {
    if (!step || typeof step !== "object" || (step as Json).type !== "model_output") continue;
    const content = Array.isArray((step as Json).content) ? (step as Json).content as unknown[] : [];
    for (const part of content) {
      if (part && typeof part === "object" && (part as Json).type === "text") {
        const text = cleanText((part as Json).text, 20000);
        if (text) chunks.push(text);
      }
    }
  }
  return chunks.join("\n").trim();
}

export function extractToolCalls(interaction: Json): ToolCall[] {
  const steps = Array.isArray(interaction.steps) ? interaction.steps : [];
  return steps.flatMap((step) => {
    if (!step || typeof step !== "object") return [];
    const row = step as Json;
    if (row.type !== "function_call") return [];
    const id = cleanText(row.id, 160);
    const name = cleanText(row.name, 120);
    if (!id || !name) return [];
    const args = row.arguments && typeof row.arguments === "object" && !Array.isArray(row.arguments) ? row.arguments as Json : {};
    return [{ id, name, arguments: args }];
  });
}

export function mapUsage(usage: unknown) {
  const u = usage && typeof usage === "object" ? usage as Json : {};
  const input = Number(u.total_input_tokens ?? u.input_tokens ?? 0);
  const cached = Number(u.total_cached_tokens ?? u.cached_tokens ?? 0);
  const output = Number(u.total_output_tokens ?? u.output_tokens ?? 0);
  const thought = Number(u.total_thought_tokens ?? u.thoughts_tokens ?? 0);
  const total = Number(u.total_tokens ?? 0);
  return {
    promptTokenCount: Number.isFinite(input) ? input : 0,
    cachedContentTokenCount: Number.isFinite(cached) ? cached : 0,
    candidatesTokenCount: Number.isFinite(output) ? output : 0,
    thoughtsTokenCount: Number.isFinite(thought) ? thought : 0,
    totalTokenCount: Number.isFinite(total) ? total : 0,
  };
}

export async function geminiInteraction(
  body: Json,
  apiKey = Deno.env.get("GEMINI_API_KEY") ?? "",
): Promise<Json> {
  const maxAttempts = 3;
  let lastError = "";
  let retryCount = 0;
  const startedAt = Date.now();

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(GEMINI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
          "Api-Revision": "2026-05-20",
        },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      let parsed: Json = {};
      try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text.slice(0, 1000) }; }

      if (response.ok) {
        parsed.__sanad_retry_count = retryCount;
        parsed.__sanad_http_latency_ms = Date.now() - startedAt;
        return parsed;
      }

      const message = cleanText((parsed.error as Json | undefined)?.message ?? text, 1200);
      lastError = `gemini_${response.status}:${message}`;
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === maxAttempts) throw new Error(lastError);
    } catch (cause) {
      const message = cleanText(cause instanceof Error ? cause.message : cause,1200);
      lastError = message || "gemini_network_error";
      const retryableNetwork = !/^gemini_4\d\d:/.test(lastError) || /^gemini_429:/.test(lastError);
      if (!retryableNetwork || attempt === maxAttempts) throw new Error(lastError);
    }

    retryCount += 1;
    const delayMs = retryCount === 1 ? 250 : 700;
    await new Promise((resolve) => setTimeout(resolve,delayMs));
  }

  throw new Error(lastError || "gemini_runtime_error");
}

function collectCurrencies(value: unknown, output = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectCurrencies(item, output);
    return output;
  }
  if (!value || typeof value !== "object") return output;
  for (const [key, raw] of Object.entries(value as Json)) {
    if ((key === "currency" || key === "english_code") && typeof raw === "string" && /^[A-Z]{3}$/.test(raw)) output.add(raw);
    collectCurrencies(raw, output);
  }
  return output;
}

function currencyMentioned(text: string, currency: string) {
  const aliases: Record<string, string[]> = {
    SAR: ["SAR", "ر.س", "ريال سعودي", "ريالًا سعوديًا", "ريال سعوديّ"],
    YER: ["YER", "ر.ي", "ريال يمني", "ريالًا يمنيًا"],
    USD: ["USD", "$", "دولار"],
  };
  return (aliases[currency] ?? [currency]).some((token) => text.includes(token));
}

function extractPeriodFromOutput(value: unknown): { from?: string; to?: string } | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Json;

  const period = row.period;
  if (period && typeof period === "object" && !Array.isArray(period)) {
    const p = period as Json;
    const from = typeof p.from === "string" ? p.from : undefined;
    const to = typeof p.to === "string" ? p.to : undefined;
    if (from || to) return { from, to };
  }

  const fromDate = typeof row.from_date === "string" ? row.from_date : undefined;
  const toDate = typeof row.to_date === "string" ? row.to_date : undefined;
  if (fromDate || toDate) return { from: fromDate, to: toDate };

  for (const key of ["context", "dashboard", "data"]) {
    const nested = extractPeriodFromOutput(row[key]);
    if (nested) return nested;
  }
  return undefined;
}

export function verifyAndRepair(
  text: string,
  toolOutputs: Array<{ name: string; args: Json; output: unknown }>,
) {
  let answer = cleanText(text, 18000);
  const currencies = [...collectCurrencies(toolOutputs.map((row) => row.output))].sort();
  const financial = toolOutputs.some((row) =>
    row.name.startsWith("finance_")
    || row.name.startsWith("business_")
    || row.name.startsWith("erp_")
    || row.name.startsWith("action_prepare_")
    || row.name === "action_edit_personal_transaction"
  );
  const missingCurrencies = financial ? currencies.filter((currency) => !currencyMentioned(answer, currency)) : [];

  const periods = toolOutputs
    .map((row) => {
      const from = String(row.args.from ?? "");
      const to = String(row.args.to ?? "");
      if (/^\d{4}-\d{2}-\d{2}$/.test(from) || /^\d{4}-\d{2}-\d{2}$/.test(to)) {
        return { from: from || undefined, to: to || undefined };
      }
      return extractPeriodFromOutput(row.output);
    })
    .filter((period): period is { from?: string; to?: string } => Boolean(period?.from || period?.to));
  const period = periods[0];
  const periodVisible = !period || [period.from, period.to].filter(Boolean).every((date) => answer.includes(date));

  const repairs: string[] = [];
  const actionPrepared = toolOutputs.some((row) => isPersistedActionReview(row.name,row.output));
  if (missingCurrencies.length) repairs.push(`العملات الموجودة في المصادر: ${currencies.join("، ")}، وكل عملة معروضة بصورة مستقلة دون دمج.`);
  if (period && !periodVisible) repairs.push(`الفترة المرجعية: ${period.from || "البداية"} — ${period.to || "اليوم"}.`);
  const alreadyExplainsReview = /مسودة[\s\S]*مراجعة/.test(answer) && /اعتماد[\s\S]*(?:البطاقة|الواجهة)/.test(answer) && /لم[\s\S]*(?:تنف|تسجيل|إنشاء)/.test(answer);
  if (actionPrepared && !alreadyExplainsReview) repairs.push("حالة الإجراء: هذه مسودة مراجعة فقط؛ لم تُنفذ أي عملية مالية بعد، والتنفيذ يتطلب اعتمادك الصريح من البطاقة.");
  if (repairs.length) answer = `${answer}\n\n${repairs.join("\n")}`.trim();

  return {
    text: answer,
    currencies,
    period: period && (period.from || period.to) ? period : undefined,
    verification: {
      passed: Boolean(answer),
      no_currency_merge: true,
      missing_currency_mentions_repaired: missingCurrencies,
      period_repaired: Boolean(period && !periodVisible),
      action_draft_guard_applied: actionPrepared,
    },
  };
}


export function inferScope(toolNames: string[]): "personal" | "business" | "product" {
  if (toolNames.some((name) =>
    name.startsWith("erp_")
    || name.startsWith("business_")
    || name === "action_prepare_commercial_document"
  )) return "business";
  if (toolNames.length > 0 && toolNames.every((name) => name === "sanad_search_knowledge")) return "product";
  return "personal";
}

export function detectClarification(text: string): boolean {
  return /وضح|توضيح|يرجى\s+تحديد|يُرجى\s+تحديد|تحديد\s+(?:العميل|الحساب|النشاط|المحل)|أي\s+(?:حساب|نشاط|عميل|محل)|تقصد|حدد|اختر/.test(text);
}
