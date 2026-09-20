# SANAD Agent Attachments v1

Status: staged implementation — 2026-09-20

## Scope

Attachments v1 adds a safe, read-oriented path for user-provided files inside SANAD conversations:

1. user selects an image or supported document;
2. file is uploaded to a private Supabase Storage bucket;
3. the attachment is registered against the authenticated SANAD thread;
4. an authenticated Edge Function downloads it through the user's Storage RLS context;
5. Gemini extracts a bounded structured summary;
6. SANAD performs read-only matching against the business ERP replica when a business context exists;
7. SANAD returns one of:
   - `link_existing`
   - `draft_candidate`
   - `review_required`
8. the user reviews the result before sending it into the conversation.

No financial write is executed by this stage.

## Supported files

Attachments v1 accepts up to 20 MiB per file and up to three files per outgoing turn.

Supported MIME types:

- PDF
- JSON
- plain text
- CSV
- RTF
- JPEG
- PNG
- WebP
- BMP

PDF is the preferred document format when visual layout, tables or rendered structure matter.

## Storage

Bucket: `sanad-agent-attachments`

The bucket is private.

Object paths follow:

`<auth.uid()>/<thread_id>/<generated-file-name>`

Storage RLS verifies both the authenticated user folder and ownership of the referenced SANAD thread.

## Attachment record

`sanad_agent_attachments` stores:

- owner and thread;
- optional business context;
- private storage path;
- file metadata;
- analysis state;
- bounded structured extraction;
- read-only ERP matches;
- suggestion;
- model and error metadata.

Raw file bytes are not copied into the conversation database.

## Analysis boundary

The model extracts only a bounded structure such as:

- document type;
- likely operation type;
- direction;
- short summary;
- document/reference number;
- date;
- amount and currency;
- counterparty;
- a short text excerpt;
- line items;
- confidence and warnings.

The extraction prompt explicitly forbids treating the file as proof of bank settlement or creating an operation.

## ERP matching

When the thread has a business context, matching may read:

- `get_business_erp_customer_candidates_v1`
- `get_business_erp_documents_v1`

SANAD first prefers an exact existing document number match. If no document match exists, it may suggest a uniquely resolved customer match. Only after those checks may it offer a `draft_candidate`.

## Draft safety

A `draft_candidate` is only structured proposed data.

It always carries:

- `requires_explicit_review = true`
- `write_performed = false`

Attachments v1 does not call any operation-write command, does not create a posted accounting record, and does not mutate Edaa.

## Conversation grounding

Only attachments with status `ready` can be sent into an Agent turn.

The Agent receives bounded attachment summaries and is instructed that these are preliminary analysis, not accounting truth. Financial facts should still be verified through live SANAD tools.

The saved user message keeps the attachment IDs so attachments remain visible when the conversation is reopened.

## User experience

Before sending, the user can see:

- file name and size;
- analysis status;
- short extracted summary;
- whether SANAD found an existing ERP document/customer candidate;
- whether the file is only suitable for a draft proposal;
- explicit wording that no operation has been created.

Unsent attachments are restored after a page reload instead of becoming invisible orphan files.
