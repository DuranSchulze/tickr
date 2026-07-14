# Invoicing — Template Creation, Invoice Generation & Payment Tracking

> **Status:** 📋 Planned

## Status

- [ ] Plan created and reviewed against existing billing infrastructure.
- [ ] Database migration generated: invoice templates, invoices, line items, payments, time-entry mapping.
- [ ] Backend: Zod schemas, server functions, invoice number generation, rate resolution, PDF generation.
- [ ] Frontend: Template management, invoice list/detail/create, payment tracking.
- [ ] Navigation and routing integrated.
- [ ] Validation: typecheck, lint, manual smoke test of full invoice lifecycle.

## 1. Goal

Add a complete invoicing system to Tickr that lets workspace owners/admins:

1. **Create and manage invoice templates** — reusable layouts that define client, payment terms, tax rates, notes, and line-item structure.
2. **Generate invoices from tracked time** — select a client, date range, and members; the system pulls time entries, resolves billing rates, computes totals, and produces a draft invoice.
3. **Track payments** — record payments against invoices, track outstanding balances, and view payment history.

The system builds directly on Tickr's existing billing infrastructure: workspace default rates, member rate overrides, client-specific rates, and member-client rate overrides.

## 2. Existing Infrastructure (What We Build On)

| Capability                                                    | Location                                              | Status  |
| ------------------------------------------------------------- | ----------------------------------------------------- | ------- |
| Rate resolution (workspace → member → client → member-client) | `src/lib/time-tracker/billing.ts`                     | ✅ Done |
| Currency support (PHP, USD, EUR, etc.)                        | `src/lib/server/tracker/workspace-billing.server.ts`  | ✅ Done |
| Bulk report with time entries, rates, amounts                 | `src/lib/server/tracker/bulk-report.server.ts`        | ✅ Done |
| PDF generation (jsPDF + autotable)                            | `src/lib/time-tracker/bulk-report-export.ts`          | ✅ Done |
| CSV generation                                                | `src/lib/time-tracker/export-utils.ts`                | ✅ Done |
| Audit logging                                                 | `src/lib/server/tracker/audit/audit-logger.server.ts` | ✅ Done |
| Client catalog with billable rates                            | `src/db/schema.ts` → `clients` table                  | ✅ Done |
| Member-client rate overrides                                  | `src/db/schema.ts` → `memberClientBillableRates`      | ✅ Done |
| Role-based access (OWNER, ADMIN, MANAGER, EMPLOYEE)           | `src/lib/server/tracker/shared/role-gates.server.ts`  | ✅ Done |

## 3. Scope

- Database: 5 new tables (templates, invoices, line items, payments, invoice-time-entry mapping).
- Server: Zod schemas, CRUD functions, invoice number auto-generation, PDF rendering, audit logging.
- Frontend: Template list/create/edit, invoice list/detail/create, payment form, PDF download.
- Navigation: New "Invoicing" section under the app layout.
- Access control: OWNER and ADMIN only for all invoicing operations.

## 4. Out of Scope

- Email delivery of invoices to clients.
- Client portal for viewing/paying invoices.
- Online payment integration (Stripe, PayPal, etc.).
- Recurring/scheduled invoice automation.
- Tax calculation beyond a simple flat rate per invoice.
- Multi-currency per invoice (each invoice uses a single currency).
- Expense/invoice line items not tied to time entries (manual line items only).
- Credit notes/refunds.

## 5. Affected Files and Folders

```txt
drizzle/
  0002_add_invoicing.sql                            (NEW migration)

src/
  db/
    schema.ts                                       (5 new tables + enums)

  lib/
    server/
      tracker/
        shared/
          schemas.ts                                (invoice Zod schemas)
        invoicing/
          templates.server.ts                       (NEW: CRUD for templates)
          invoices.server.ts                        (NEW: CRUD + generation)
          payments.server.ts                        (NEW: payment recording)
          invoice-pdf.server.ts                     (NEW: PDF generation)
        index.ts                                    (export server fns)

    time-tracker/
      invoice-pdf.ts                                (NEW: client-side PDF download)

  components/
    time-tracker/
      invoicing/
        TemplatesList.tsx                           (NEW)
        TemplateForm.tsx                            (NEW: create/edit)
        InvoicesList.tsx                            (NEW)
        InvoiceDetail.tsx                           (NEW)
        InvoiceCreateDialog.tsx                     (NEW: generate from time)
        PaymentForm.tsx                             (NEW: record payment)
        InvoicePdfDownload.tsx                      (NEW: download button)

  routes/
    app/
      invoicing/
        index.tsx                                   (NEW: invoice list)
        templates/
          index.tsx                                 (NEW: template list)
          create.tsx                                (NEW: create template)
          $templateId.edit.tsx                      (NEW: edit template)
        $invoiceId.tsx                              (NEW: invoice detail)
```

## 6. Database Design

### 6.1 New Enums

```ts
// src/db/schema.ts

export const invoiceStatusEnum = pgEnum('InvoiceStatus', [
  'DRAFT',
  'SENT',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
  'CANCELLED',
])

export const paymentMethodEnum = pgEnum('PaymentMethod', [
  'BANK_TRANSFER',
  'CASH',
  'CHECK',
  'CREDIT_CARD',
  'ONLINE',
  'OTHER',
])
```

### 6.2 Invoice Templates

```ts
export const invoiceTemplates = pgTable(
  'invoice_templates',
  {
    id: varchar('id', { length: 30 })
      .primaryKey()
      .$defaultFn(() => createId()),
    workspaceId: varchar('workspace_id', { length: 30 })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description'),
    clientId: varchar('client_id', { length: 30 }).references(
      () => clients.id,
      { onDelete: 'set null' },
    ),
    paymentTermsDays: integer('payment_terms_days').notNull().default(30),
    taxRate: numeric('tax_rate', { precision: 5, scale: 2 }).default('0'),
    taxLabel: varchar('tax_label', { length: 50 }).default('VAT'),
    currency: varchar('currency', { length: 8 }).notNull().default('PHP'),
    notes: text('notes'),
    termsAndConditions: text('terms_and_conditions'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('invoice_templates_workspace_name_unique').on(
      table.workspaceId,
      table.name,
    ),
    index('invoice_templates_workspace_idx').on(table.workspaceId),
    index('invoice_templates_client_idx').on(table.clientId),
  ],
)
```

### 6.3 Invoices

```ts
export const invoices = pgTable(
  'invoices',
  {
    id: varchar('id', { length: 30 })
      .primaryKey()
      .$defaultFn(() => createId()),
    workspaceId: varchar('workspace_id', { length: 30 })
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    templateId: varchar('template_id', { length: 30 }).references(
      () => invoiceTemplates.id,
      { onDelete: 'set null' },
    ),
    clientId: varchar('client_id', { length: 30 })
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),
    invoiceNumber: varchar('invoice_number', { length: 30 }).notNull(),
    status: invoiceStatusEnum('status').notNull().default('DRAFT'),
    issueDate: date('issue_date').notNull(),
    dueDate: date('due_date').notNull(),
    currency: varchar('currency', { length: 8 }).notNull().default('PHP'),
    subtotalAmount: numeric('subtotal_amount', { precision: 12, scale: 2 })
      .notNull()
      .default('0'),
    taxRate: numeric('tax_rate', { precision: 5, scale: 2 })
      .notNull()
      .default('0'),
    taxLabel: varchar('tax_label', { length: 50 }).default('VAT'),
    taxAmount: numeric('tax_amount', { precision: 12, scale: 2 })
      .notNull()
      .default('0'),
    totalAmount: numeric('total_amount', { precision: 12, scale: 2 })
      .notNull()
      .default('0'),
    paidAmount: numeric('paid_amount', { precision: 12, scale: 2 })
      .notNull()
      .default('0'),
    notes: text('notes'),
    termsAndConditions: text('terms_and_conditions'),
    periodStartDate: date('period_start_date'),
    periodEndDate: date('period_end_date'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('invoices_workspace_number_unique').on(
      table.workspaceId,
      table.invoiceNumber,
    ),
    index('invoices_workspace_idx').on(table.workspaceId),
    index('invoices_client_idx').on(table.clientId),
    index('invoices_status_idx').on(table.status),
    index('invoices_issue_date_idx').on(table.issueDate),
    index('invoices_due_date_idx').on(table.dueDate),
  ],
)
```

### 6.4 Invoice Line Items

```ts
export const invoiceLineItems = pgTable(
  'invoice_line_items',
  {
    id: varchar('id', { length: 30 })
      .primaryKey()
      .$defaultFn(() => createId()),
    invoiceId: varchar('invoice_id', { length: 30 })
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    quantity: numeric('quantity', { precision: 10, scale: 2 }).notNull(), // hours
    unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (table) => [index('invoice_line_items_invoice_idx').on(table.invoiceId)],
)
```

### 6.5 Payments

```ts
export const invoicePayments = pgTable(
  'invoice_payments',
  {
    id: varchar('id', { length: 30 })
      .primaryKey()
      .$defaultFn(() => createId()),
    invoiceId: varchar('invoice_id', { length: 30 })
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    paymentDate: date('payment_date').notNull(),
    paymentMethod: paymentMethodEnum('payment_method')
      .notNull()
      .default('BANK_TRANSFER'),
    reference: varchar('reference', { length: 200 }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('invoice_payments_invoice_idx').on(table.invoiceId)],
)
```

### 6.6 Invoice–Time-Entry Mapping

Prevents double-billing by tracking which time entries are included in which invoice.

```ts
export const invoiceTimeEntries = pgTable(
  'invoice_time_entries',
  {
    invoiceId: varchar('invoice_id', { length: 30 })
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    timeEntryId: varchar('time_entry_id', { length: 30 })
      .notNull()
      .references(() => timeEntries.id, { onDelete: 'restrict' }),
  },
  (table) => [
    primaryKey({ columns: [table.invoiceId, table.timeEntryId] }),
    index('invoice_time_entries_time_entry_idx').on(table.timeEntryId),
  ],
)
```

### 6.7 Type Exports

```ts
export type InvoiceStatus = (typeof invoiceStatusEnum.enumValues)[number]
export type PaymentMethod = (typeof paymentMethodEnum.enumValues)[number]
```

### Sample Data

```sql
-- Sample template
INSERT INTO invoice_templates (id, workspace_id, name, client_id, payment_terms_days, tax_rate, tax_label, currency, notes, terms_and_conditions)
VALUES ('tpl_01', 'ws_01', 'Standard Monthly', 'client_01', 30, 12.00, 'VAT', 'PHP',
  'Thank you for your business.',
  'Payment is due within 30 days. Late payments may incur a 2% monthly interest charge.');

-- Sample invoice
INSERT INTO invoices (id, workspace_id, client_id, invoice_number, status, issue_date, due_date, currency, subtotal_amount, tax_rate, tax_label, tax_amount, total_amount, paid_amount, period_start_date, period_end_date)
VALUES ('inv_01', 'ws_01', 'client_01', 'INV-2026-0001', 'SENT', '2026-07-01', '2026-07-31', 'PHP', 50000.00, 12.00, 'VAT', 6000.00, 56000.00, 0, '2026-06-01', '2026-06-30');
```

- [ ] Generate migration: `npx drizzle-kit generate`.
- [ ] Review generated SQL for correctness.
- [ ] Run migration: `npx drizzle-kit migrate`.

## 7. Backend Implementation

### 7.1 Zod Schemas

Add to `src/lib/server/tracker/shared/schemas.ts`:

```ts
// ── Invoice Templates ──────────────────────────────────────────────────────────

export const createInvoiceTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  clientId: z.string().min(1).optional(),
  paymentTermsDays: z.number().int().min(0).max(365).default(30),
  taxRate: z.number().min(0).max(100).default(0),
  taxLabel: z.string().trim().max(50).default('VAT'),
  currency: z.string().trim().min(3).max(8).default('PHP'),
  notes: z.string().max(2000).optional(),
  termsAndConditions: z.string().max(5000).optional(),
})

export const updateInvoiceTemplateSchema = createInvoiceTemplateSchema.extend({
  id: z.string().min(1),
})

// ── Invoices ────────────────────────────────────────────────────────────────────

export const createInvoiceSchema = z.object({
  templateId: z.string().min(1).optional(),
  clientId: z.string().min(1),
  issueDate: z.string().date(),
  dueDate: z.string().date(),
  currency: z.string().trim().min(3).max(8).default('PHP'),
  taxRate: z.number().min(0).max(100).default(0),
  taxLabel: z.string().trim().max(50).default('VAT'),
  notes: z.string().max(2000).optional(),
  termsAndConditions: z.string().max(5000).optional(),
  periodStartDate: z.string().date().optional(),
  periodEndDate: z.string().date().optional(),
  // Line items can be provided directly for manual invoices.
  lineItems: z
    .array(
      z.object({
        description: z.string().trim().min(1).max(500),
        quantity: z.number().min(0),
        unitPrice: z.number().min(0),
      }),
    )
    .optional(),
})

export const generateInvoiceFromTimeSchema = z.object({
  templateId: z.string().min(1).optional(),
  clientId: z.string().min(1),
  startDate: z.string().date(),
  endDate: z.string().date(),
  memberIds: z.array(z.string().min(1)).optional(),
  projectIds: z.array(z.string().min(1)).optional(),
  groupBy: z.enum(['member', 'project', 'task', 'none']).default('member'),
  // Optional overrides from the template defaults
  issueDate: z.string().date().optional(),
  paymentTermsDays: z.number().int().min(0).max(365).optional(),
  taxRate: z.number().min(0).max(100).optional(),
  taxLabel: z.string().trim().max(50).optional(),
  currency: z.string().trim().min(3).max(8).optional(),
  notes: z.string().max(2000).optional(),
  termsAndConditions: z.string().max(5000).optional(),
})

export const updateInvoiceSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['DRAFT', 'SENT', 'CANCELLED']).optional(),
  issueDate: z.string().date().optional(),
  dueDate: z.string().date().optional(),
  notes: z.string().max(2000).optional(),
  termsAndConditions: z.string().max(5000).optional(),
})

// ── Payments ────────────────────────────────────────────────────────────────────

export const createPaymentSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.number().positive(),
  paymentDate: z.string().date(),
  paymentMethod: z
    .enum(['BANK_TRANSFER', 'CASH', 'CHECK', 'CREDIT_CARD', 'ONLINE', 'OTHER'])
    .default('BANK_TRANSFER'),
  reference: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
})
```

- [ ] Add all schemas to `src/lib/server/tracker/shared/schemas.ts`.

### 7.2 Invoice Number Generation

Create `src/lib/server/tracker/invoicing/invoice-number.ts`:

```ts
import { db } from '#/db'
import { invoices } from '#/db/schema'
import { and, desc, eq } from 'drizzle-orm'

/**
 * Generates the next invoice number for a workspace.
 * Format: INV-YYYY-NNNN (e.g., INV-2026-0001)
 *
 * Scoped per workspace — each workspace has its own sequence.
 * Resets numbering at the start of each calendar year.
 */
export async function generateInvoiceNumber(
  workspaceId: string,
): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `INV-${year}-`

  const [last] = await db
    .select({ invoiceNumber: invoices.invoiceNumber })
    .from(invoices)
    .where(
      and(
        eq(invoices.workspaceId, workspaceId),
        // Only look at current year's invoices
      ),
    )
    .orderBy(desc(invoices.invoiceNumber))
    .limit(1)

  let nextNumber = 1
  if (last) {
    const match = last.invoiceNumber.match(/INV-\d{4}-(\d{4})$/)
    if (match) {
      nextNumber = parseInt(match[1], 10) + 1
    }
  }

  return `${prefix}${String(nextNumber).padStart(4, '0')}`
}
```

> Uses the existing `cuid2`-based `id` column as the primary key. The `invoiceNumber` is a human-readable sequence number, unique per workspace.

- [ ] Create `invoice-number.ts` with `generateInvoiceNumber`.

### 7.3 Template CRUD

Create `src/lib/server/tracker/invoicing/templates.server.ts`:

Follow the established pattern from `src/lib/server/tracker/catalogs/clients.server.ts`:

- `createInvoiceTemplate(data)` — requires OWNER/ADMIN, inserts row, audits.
- `updateInvoiceTemplate(data)` — requires OWNER/ADMIN, updates row, audits.
- `getInvoiceTemplates()` — returns all templates for the workspace.
- `getInvoiceTemplate(id)` — returns a single template with client name.
- `deleteInvoiceTemplate(id)` — requires OWNER/ADMIN, deletes if no invoices reference it.

- [ ] Create `templates.server.ts` following the clients.server.ts pattern.
- [ ] Export server functions: `createInvoiceTemplateFn`, `updateInvoiceTemplateFn`, etc.

### 7.4 Invoice CRUD + Time-Based Generation

Create `src/lib/server/tracker/invoicing/invoices.server.ts`:

**Core operations:**

- `createInvoice(data)` — creates a DRAFT invoice with manual line items.
- `getInvoices(filters)` — paginated list with status/client filters and sorting.
- `getInvoice(id)` — full invoice with line items, payments, and client details.
- `updateInvoice(data)` — updates status/notes, re-validates state transitions.
- `deleteInvoice(id)` — only allowed for DRAFT invoices with no payments.

**Time-based generation** (the key novel logic):

```
generateInvoiceFromTime(data):
  1. Validate workspace access (OWNER/ADMIN).
  2. If templateId provided, load template defaults.
  3. Query time entries for the client + date range + optional member/project filters.
     - Exclude entries already mapped to another invoice (JOIN invoiceTimeEntries).
     - Only completed entries (endedAt IS NOT NULL).
     - Only billable entries (billable = true).
  4. Resolve billing rates for each entry using existing resolveEntryRateMap.
  5. Group entries by the specified groupBy dimension:
     - 'member': one line item per member (e.g., "John Doe — Development work")
     - 'project': one line item per project
     - 'task': one line item per task
     - 'none': one line per entry
  6. For each group, sum durationSeconds and compute amount.
  7. Create the invoice with:
     - Auto-generated invoice number
     - Line items for each group
     - Computed subtotal, tax, total
     - Period start/end dates
  8. Insert invoiceTimeEntries mappings.
  9. Audit log the creation.
```

> **Rate resolution** reuses `resolveEntryRateMap` from `rates.server.ts` — the same function used by bulk reports. This ensures invoices use the exact same rates as exports.

**Status transitions:**

```
DRAFT → SENT      (mark as sent to client)
DRAFT → CANCELLED  (void the invoice)
SENT → PAID        (full payment received — automatic when paidAmount >= totalAmount)
SENT → PARTIALLY_PAID (some payment received)
PARTIALLY_PAID → PAID (remaining balance paid)
SENT → OVERDUE     (automatic — computed from dueDate < today AND status = SENT)
OVERDUE → PAID     (full payment received)
OVERDUE → PARTIALLY_PAID (some payment received)
```

> OVERDUE is a **computed** status — not stored directly. When querying invoices, any SENT or PARTIALLY_PAID invoice with `dueDate < today` is displayed as OVERDUE. The actual stored status remains SENT/PARTIALLY_PAID.

- [ ] Create `invoices.server.ts` with CRUD + `generateInvoiceFromTime`.
- [ ] Export server functions.

### 7.5 Payment Recording

Create `src/lib/server/tracker/invoicing/payments.server.ts`:

```ts
/**
 * Records a payment against an invoice. Automatically recomputes paid_amount
 * and updates the invoice status based on the new balance.
 *
 * Rules:
 * - Cannot overpay: amount must be ≤ remaining balance.
 * - After recording, if paid_amount ≥ total_amount → status = PAID.
 * - Otherwise if paid_amount > 0 → status = PARTIALLY_PAID.
 */
export async function recordPayment(data: z.infer<typeof createPaymentSchema>) {
  const access = await requireWorkspaceAccess()
  assertOwnerOrAdmin(access)

  // Load invoice, verify it belongs to this workspace.
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.id, data.invoiceId),
        eq(invoices.workspaceId, access.workspace.id),
      ),
    )
    .limit(1)

  if (!invoice) throw new Error('Invoice not found.')
  if (invoice.status === 'DRAFT') throw new Error('Cannot pay a draft invoice.')
  if (invoice.status === 'CANCELLED')
    throw new Error('Cannot pay a cancelled invoice.')

  const remaining = Number(invoice.totalAmount) - Number(invoice.paidAmount)
  if (data.amount > remaining) {
    throw new Error(
      `Payment exceeds remaining balance of ${remaining.toFixed(2)}.`,
    )
  }

  // Insert payment.
  await db.insert(invoicePayments).values({
    invoiceId: data.invoiceId,
    amount: String(data.amount),
    paymentDate: data.paymentDate,
    paymentMethod: data.paymentMethod,
    reference: data.reference ?? null,
    notes: data.notes ?? null,
  })

  // Update invoice paid_amount and status.
  const newPaidAmount = Number(invoice.paidAmount) + data.amount
  const newStatus =
    newPaidAmount >= Number(invoice.totalAmount) ? 'PAID' : 'PARTIALLY_PAID'

  await db
    .update(invoices)
    .set({
      paidAmount: String(newPaidAmount),
      status: newStatus,
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, data.invoiceId))

  await createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'record_payment',
    targetType: 'invoice',
    targetId: data.invoiceId,
    metadata: {
      amount: data.amount,
      newPaidAmount,
      newStatus,
    },
  })
}
```

- [ ] Create `payments.server.ts` with `recordPayment`.
- [ ] Export server function: `recordPaymentFn`.

### 7.6 Invoice PDF Generation

Create `src/lib/server/tracker/invoicing/invoice-pdf.server.ts`:

Server-side function that returns PDF bytes (or generates on client-side for download). Follow the PDF pattern from `bulk-report-export.ts` but with an invoice-specific layout:

**PDF Layout:**

- Header: Company/workspace name, "INVOICE" title, invoice number, status badge.
- Meta section: issue date, due date, client name.
- Line items table: description, quantity (hours), rate, amount. Subtotal, tax, total.
- Footer: notes, terms & conditions, payment instructions.
- Consistent branding using workspace name.

> Use client-side jsPDF with `import('jspdf')` + `import('jspdf-autotable')` — same lazy-loading pattern as existing exports.

- [ ] Create `invoice-pdf.server.ts` or client-side `invoice-pdf.ts` for PDF download.
- [ ] Reuse `formatMoney`, `formatHms`, `formatDecimalHours` from `export-utils.ts`.

### 7.7 Server Function Exports

Update `src/lib/server/tracker/index.ts` to export all new server functions:

```ts
export const createInvoiceTemplateFn = createServerFn(...)
export const updateInvoiceTemplateFn = createServerFn(...)
export const getInvoiceTemplatesFn = createServerFn(...)
export const getInvoiceTemplateFn = createServerFn(...)
export const deleteInvoiceTemplateFn = createServerFn(...)
export const createInvoiceFn = createServerFn(...)
export const generateInvoiceFromTimeFn = createServerFn(...)
export const getInvoicesFn = createServerFn(...)
export const getInvoiceFn = createServerFn(...)
export const updateInvoiceFn = createServerFn(...)
export const deleteInvoiceFn = createServerFn(...)
export const recordPaymentFn = createServerFn(...)
export const getInvoicePaymentsFn = createServerFn(...)
```

- [ ] Export all server functions following the existing `createServerFn` pattern.

## 8. Frontend Implementation

### 8.1 Navigation

Add an "Invoicing" section to the app layout. The exact placement depends on the current navigation structure — follow the pattern used by Catalogs, Analytics, etc.

**Route structure (TanStack Start):**

```
src/routes/app/invoicing/
  index.tsx                    → Invoice list (paginated, filterable by status/client)
  templates/
    index.tsx                  → Template list
    create.tsx                 → Create template form
    $templateId.edit.tsx       → Edit template form
  $invoiceId.tsx               → Invoice detail with line items, payments, PDF download
```

- [ ] Add routes following the existing route pattern.
- [ ] Add navigation link/icon in the app sidebar.

### 8.2 Template List & Form

**`TemplatesList.tsx`**: Table showing template name, default client, payment terms, tax rate. Actions: Edit, Delete. "New Template" button.

**`TemplateForm.tsx`** (shared create/edit): Form fields:

- Name (required)
- Description (optional)
- Client (dropdown — optional default)
- Payment terms (number input, days)
- Tax rate (percentage input)
- Tax label (e.g., "VAT", "GST", "HST")
- Currency (from workspace default)
- Notes (textarea)
- Terms & conditions (textarea)

Follow the pattern from `ClientForm.tsx` / `EditClientForm.tsx` for form layout and submission.

- [ ] Create `TemplatesList.tsx`.
- [ ] Create `TemplateForm.tsx`.
- [ ] Wire up routes.

### 8.3 Invoice List

**`InvoicesList.tsx`**: Paginated table with columns:

- Invoice number
- Client name
- Issue date
- Due date
- Status (with colored badge: DRAFT=gray, SENT=blue, PAID=green, OVERDUE=red, PARTIALLY_PAID=amber, CANCELLED=gray)
- Total amount
- Paid amount / balance
- Actions: View, Mark Sent, Record Payment, Download PDF, Cancel

Filters: Status dropdown, Client dropdown, Date range.

"New Invoice" button opens `InvoiceCreateDialog`.

- [ ] Create `InvoicesList.tsx` following the paginated table pattern from `ClientsTablePage.tsx`.

### 8.4 Invoice Creation Dialog

**`InvoiceCreateDialog.tsx`**: Two modes:

**Mode 1: Generate from Time** (primary flow)

- Client selector (dropdown)
- Date range picker (start/end)
- Optional: member filter (multi-select), project filter
- Grouping: Member / Project / Task / None
- Template selector (optional — pre-fills tax rate, terms, notes)
- Preview of computed line items before confirming
- "Generate Invoice" button

The preview fetches a summary via a server function (or computes client-side from rate data) so the user can review totals before committing.

**Mode 2: Manual Invoice**

- Client selector
- Add line items manually (description, quantity, unit price)
- Tax rate, notes, terms
- Issue date, due date

- [ ] Create `InvoiceCreateDialog.tsx`.
- [ ] Implement time-entry preview query.
- [ ] Wire "New Invoice" button in `InvoicesList`.

### 8.5 Invoice Detail Page

**`$invoiceId.tsx`**: Full invoice view:

- Header: Invoice number, status badge, client name.
- Meta: issue date, due date, period (if applicable).
- Line items table: description, hours, rate, amount. Subtotal, tax, total.
- Payment section:
  - List of recorded payments (date, method, amount, reference).
  - Remaining balance display.
  - "Record Payment" button → opens `PaymentForm` dialog.
- Actions: Mark as Sent, Download PDF, Cancel Invoice.
- Notes and terms & conditions display.

- [ ] Create `InvoiceDetail` component.
- [ ] Create `PaymentForm` dialog (amount, date, method, reference, notes).
- [ ] Wire up route.

### 8.6 PDF Download

**`InvoicePdfDownload.tsx`**: Reusable button component that fetches invoice data and generates a PDF using jsPDF + autotable. Follows the pattern from `downloadGroupedTimeReportPdf` in `bulk-report-export.ts`:

```tsx
export function InvoicePdfDownload({ invoice }: { invoice: InvoiceDetail }) {
  async function handleDownload() {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ])
    // Build PDF with invoice layout...
    doc.save(`invoice-${invoice.invoiceNumber}.pdf`)
  }

  return <Button onClick={handleDownload}>Download PDF</Button>
}
```

> Perform PDF generation client-side to avoid server round-trips for the heavy jsPDF library.

- [ ] Create `InvoicePdfDownload.tsx`.

## 9. Access Control

All invoicing operations require OWNER or ADMIN role (via `assertOwnerOrAdmin` from `role-gates.server.ts`).

- VIEW (list templates, list invoices, view invoice detail): OWNER, ADMIN
- CREATE/EDIT/DELETE (templates, invoices, payments): OWNER, ADMIN only

This is simpler than the existing catalogs which allow MANAGER access for some operations. Invoicing is a financial feature — restricting to OWNER/ADMIN is appropriate for v1.

## 10. Validation

- [ ] Run `npx drizzle-kit generate` — verify migration SQL.
- [ ] Run `npx drizzle-kit migrate` — apply migration.
- [ ] Run `pnpm typecheck` — zero errors.
- [ ] Run `pnpm lint` — zero new warnings.

**Manual smoke test — full lifecycle:**

- [ ] Create an invoice template with client, 30-day terms, 12% VAT.
- [ ] Create time entries for that client (billable, completed) across several days.
- [ ] Generate an invoice from those time entries. Verify:
  - Line items correctly group by member (or chosen grouping).
  - Subtotal, tax, total computed correctly.
  - Invoice number auto-generated (e.g., INV-2026-0001).
  - Status is DRAFT.
- [ ] View invoice detail. Verify line items, amounts.
- [ ] Download PDF. Verify layout, branding, all amounts.
- [ ] Mark invoice as SENT. Verify status updates.
- [ ] Record a partial payment. Verify status → PARTIALLY_PAID, paid amount updates.
- [ ] Record the remaining balance. Verify status → PAID.
- [ ] Try generating another invoice for same time entries — verify they're excluded (already billed).
- [ ] Create a manual invoice with custom line items.
- [ ] Cancel a DRAFT invoice. Verify it can't be paid.
- [ ] Delete a DRAFT invoice with no payments. Verify success.

## 11. Sequencing

| Phase                     | What                                                                 | Depends On |
| ------------------------- | -------------------------------------------------------------------- | ---------- |
| **1. Database**           | Migration: enums, 5 tables                                           | Nothing    |
| **2. Schemas**            | Zod schemas in `shared/schemas.ts`                                   | Phase 1    |
| **3. Invoice Numbers**    | `invoice-number.ts` generator                                        | Phase 1    |
| **4. Templates Backend**  | CRUD server functions                                                | Phases 1–2 |
| **5. Templates Frontend** | List + Create/Edit forms + routes                                    | Phase 4    |
| **6. Invoice Backend**    | CRUD + time-based generation + PDF                                   | Phases 1–3 |
| **7. Payments Backend**   | Payment recording + status automation                                | Phase 6    |
| **8. Invoice Frontend**   | List + Detail + Create Dialog + Payment Form + PDF Download + routes | Phases 5–7 |

Phase 5 is a natural checkpoint — verify templates work end-to-end before building the more complex invoice generation.

## 12. Risks & Considerations

- **Double-billing**: The `invoiceTimeEntries` mapping table prevents time entries from being included in multiple invoices. The generation query joins against this table to exclude already-billed entries.
- **Rate changes**: If a member's rate changes after an invoice is created, existing invoices are unaffected (line item amounts are snapshotted at creation time).
- **Deleted time entries**: If a time entry is deleted after being invoiced, the invoice line item still exists (it's a snapshot). The `ON DELETE RESTRICT` on `invoiceTimeEntries.timeEntryId` reference prevents accidental deletion of invoiced entries.
- **OVERDUE computation**: Since OVERDUE is computed at query time (not stored), filtering/searching for overdue invoices requires `dueDate < CURRENT_DATE AND status IN ('SENT', 'PARTIALLY_PAID')`. Consider adding a database view or a cron-like scheduled function to avoid scanning all invoices on every list query.
