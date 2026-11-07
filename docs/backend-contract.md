# 420 Cartel — Backend Contract

How the database and the `src/lib` layer are meant to be used. Written for whoever
builds the storefront, POS and admin UI on top of it.

**Rule of thumb:** business logic lives in Postgres, not in the UI. The UI collects
intent, calls one RPC, and renders the result or the error sentence.

---

## 1. Migrations

| File | Contents |
|---|---|
| `20261107000001_cartel_core.sql` | Enums, SA ID validation functions, `branches`, `staff_profiles`, `members`, `kyc_documents` |
| `20261107000002_cartel_inventory_orders.sql` | Catalogue, `master_batches`, `stock_movements`, delivery zones + geo functions, orders, payments, loyalty, affiliate, media jobs, audit |
| `20261107000003_cartel_functions.sql` | `process_cartel_order` and every other transactional routine |
| `20261107000004_cartel_rls_storage.sql` | RLS on all tables, column guard triggers, storage buckets, realtime, grants |
| `20261107000005_cartel_storefront_part2.sql` | `product_stock_board`, `inventory_ledger` view, affiliate payouts, loyalty config columns, branch/zone seed |

Apply in order. `0005` depends on `0001`–`0004`.

---

## 2. The unit-of-measure model

This is the part most likely to be misunderstood, so it is stated plainly.

Every product holds **one stock balance**, in its `base_uom` — `GRAMS`,
`MILLILITERS` or `UNITS`. That balance lives on `master_batches`, split across
however many batches have been received.

A **variant** is a sellable tier. It declares `base_quantity`: how much of the
parent balance one of it consumes.

| Product | `base_uom` | Variant | `base_quantity` | Deducts |
|---|---|---|---|---|
| Indoor flower | `GRAMS` | `3.5g` | `3.5` | 3.5 from the gram balance |
| Sublingual elixir | `MILLILITERS` | `30ml` | `30` | 30 from the millilitre balance |
| Pre-roll | `UNITS` | `Single` | `1` | 1 from the unit balance |

So a 1g, 3.5g and 28g tier are **not** three stock items. They are three views of
one gram balance, and selling any of them moves the same number.

### Custom amounts

A variant with `is_custom_amount = true` is the open-ended tier (Custom g /
Custom ml). For those, and **only** those, `price_cents` is a **per-base-unit
rate**, and the caller must supply `base_qty_override`:

```
line price = round(variant.price_cents * base_qty_override)
```

For fixed tiers, `price_cents` is the tier price outright. Getting this backwards
is the single easiest way to mis-bill, so both `TierSelector` and the order
function encode it explicitly.

`UNITS` rejects fractional amounts (`CARTEL_FRACTIONAL_UNITS`).

---

## 3. `process_cartel_order`

One RPC, one transaction, for both POS and online sales.

```ts
const { data, error } = await supabase.rpc('process_cartel_order', {
  p_payload: {
    channel: 'POS',               // or 'ONLINE'
    fulfilment_type: 'IN_STORE',  // 'PICKUP' | 'DELIVERY'
    branch_id: branch.id,
    member_id: member?.id ?? null,
    items: [
      { variant_id, quantity: 2 },
      { variant_id: customTierId, quantity: 1, base_qty_override: 7.5 },
    ],
    payments: [{ method: 'CASH', amount_cents: 45000, tendered_cents: 50000 }],
    idempotency_key: createIdempotencyKey('pos'),
    ignore_reservations: true,    // POS only
  },
});
```

What it does, in order, all inside one transaction:

1. Authorises the caller — POS requires active staff; online requires the member
   to be themselves (or staff acting for them).
2. Replays safely if `idempotency_key` was already used, returning the original
   order with `replayed: true`.
3. Checks the member gate — suspended, age-unverified, and `is_member_only`
   products without a member all reject here.
4. **FIFO-deducts stock** across `master_batches` ordered by `received_at`, under
   `FOR UPDATE` row locks, writing a `stock_movements` row per batch touched. Two
   tills selling the last 3.5g queue rather than overselling.
5. Prices the lines, applies discounts and points redemption.
6. Resolves the delivery fee via `resolve_delivery_zone` (polygon beats radius) and
   enforces the zone minimum.
7. Records tender. Cash, card terminal, instant EFT and member credit capture
   immediately; manual EFT, pay-on-collection and the future gateway stay pending.
8. Accrues loyalty points, rolls up member lifetime value and rank.
9. Attributes a referral code if one was supplied.

**Any failure rolls back everything, including the stock.** Never pre-deduct stock
in the UI.

Status is `PAID` when captured tender covers the total, otherwise
`AWAITING_PAYMENT`. Overpayment raises `CARTEL_OVERPAID`.

The returned `items[].batch_allocation` lists the exact batches deducted — that is
the receipt's batch detail and the audit trail.

### Other routines

| Function | Who | Purpose |
|---|---|---|
| `cancel_cartel_order(id, reason, restock)` | staff | Restocks and reverses loyalty/credit |
| `adjust_batch_stock(batch, type, qty, reason, meta)` | staff | Intake, waste, spillage, corrections. `ADJUSTMENT` takes a **signed** qty; others are magnitudes |
| `reserve_product_stock(product, branch, qty)` | any | Soft-holds stock for an online cart; returns the allocation |
| `release_product_reservation(allocation)` | any | Gives it back |
| `lookup_member_for_pos(query)` | staff | QR token / member code / phone / email → profile |
| `adjust_member_credit(member, delta, reason)` | manager | Account credit, with ledger row |
| `review_member_kyc(member, approve, reason)` | manager | Approve or reject; approval blocked until the agreement is signed |
| `submit_member_kyc(payload)` | member | Creates/updates the profile, stamps age verification |
| `rotate_member_qr_token()` | member | Invalidates every previously issued pass QR |
| `settle_affiliate_commissions(code, ref)` | manager | Pays unpaid commission to member credit |

---

## 4. Error convention

Every business failure raises `CARTEL_<CODE>: <human sentence>`.

Parse with `translateDbError(message)` from `@/app/onboarding/actions` — it strips
the code and returns the sentence, with fallbacks for constraint names. Do not
write a second parser.

Codes: `INSUFFICIENT_STOCK`, `OUT_OF_ZONE`, `BELOW_MIN_ORDER`, `OVERPAID`,
`INSUFFICIENT_CREDIT`, `INSUFFICIENT_POINTS`, `CUSTOM_AMOUNT_REQUIRED`,
`BELOW_MIN_AMOUNT`, `FRACTIONAL_UNITS`, `MEMBER_ONLY`, `MEMBER_SUSPENDED`,
`AGE_NOT_VERIFIED`, `UNDERAGE`, `INVALID_SA_ID`, `FORBIDDEN`.

---

## 5. The member gate

Pricing lives on `product_variants`, whose RLS policy resolves **only** for
verified members and staff:

```sql
create policy variants_member_read on public.product_variants
  for select using (is_active and (public.is_active_member() or public.is_staff()));
```

A signed-out visitor querying the catalogue gets products with `variants: []`.
There is no code path where an unverified visitor is shown a price — the gate is a
database policy, not a UI condition. `ProductCard` takes a `gated` prop and renders
the lock state from it.

### Stock visibility

| Surface | Read from | Why |
|---|---|---|
| Member-facing shop | `product_stock_board` | Public-safe projection, carries **no cost price**, trigger-maintained, in `supabase_realtime` |
| Staff / admin | `product_stock_levels` view or `master_batches` | Behind staff RLS, includes cost |

`master_batches` carries `cost_per_base_unit_cents` and is staff-only, which is why
the board exists. `available_base_qty` on the board is `remaining - reserved`.

---

## 6. Age verification

The 18+ decision is made **three times**, deliberately:

1. **Browser** — `parseSaId()` in `src/lib/sa-id.ts`, for instant feedback as the
   member types. Shows the decoded date of birth so typos are self-evident.
2. **Server action** — `submitOnboarding()` re-parses before writing anything.
3. **Postgres** — `members_legal_age`, `members_sa_id_shape` and
   `members_sa_id_dob_match` CHECK constraints, plus a guard inside
   `submit_member_kyc`.

Only the third is a security boundary. The first two exist so nobody is ever told
"no" by a raw database error.

The SA ID parser is a line-for-line mirror of the SQL: Luhn mod-10 over all 13
digits, `YYMMDD` date of birth pivoting on the current year, citizenship digit 11,
gender block digits 7–10.

> The gender block is **document metadata, not self-identification**. Never render
> it as the member's gender identity.

---

## 7. Identity documents

Stored in the private `kyc-documents` bucket under `<uid>/…`, which is the only
prefix a member's storage policy lets them write.

Reviewers never see an embedded document. `getKycDocumentUrl()` mints a
**120-second** signed URL on click, opened in a new tab, never persisted. ID
numbers are masked in the CRM (`maskSaId`) and are deliberately **excluded from
member search**, so a reviewer cannot fish for an ID number they do not already
have.

Members may replace a rejected document; they can never mark one approved
(`kyc_update_self_pending` policy).

---

## 8. Column guards

Two `BEFORE UPDATE` triggers stop privilege escalation through an otherwise
legitimate update:

- `members_guard_privileged_columns` — a member may edit their own contact details
  and preferences. Status, rank, balances, points, verification stamps, referral
  code and identity fields are silently reset to their previous values.
- `orders_guard_mutations` — a member may cancel their own order while it is still
  `DRAFT`/`AWAITING_PAYMENT`, or add delivery instructions. Totals, member, branch
  and payment stamps are frozen.

Staff and service-role callers pass through untouched.

---

## 9. Payments

Checkout and the POS tender drawer **never branch on a payment method**.

```ts
const options = availablePaymentOptions(context);     // what to render
const tender  = buildTender(context, lines);          // validate + build
await supabase.rpc('process_cartel_order', {
  p_payload: { ...payload, payments: tender.payments },
});
```

`buildTender` scopes each line to the balance still outstanding, so a split tender
cannot overshoot the total. It throws `PaymentAdapterError` with a user-safe
`.message`.

Each adapter returns a `PaymentInstruction`, a discriminated union on `.kind`:
`NONE`, `CASH_DRAWER` (with change due), `TERMINAL_PROMPT`, `BANK_TRANSFER`,
`ON_COLLECTION`, `REDIRECT`, `UNAVAILABLE`. Render off that.

**Adding a live gateway** is one adapter plus a webhook that flips the payment row
to `CAPTURED`. No change to checkout, the POS, or the order function.
`FUTURE_GATEWAY` is the seam, gated behind `NEXT_PUBLIC_CARTEL_GATEWAY_ENABLED`.

---

## 10. Loyalty and affiliate

The ledgers, balances, rank fields and attribution rows are already written on every
sale by `process_cartel_order`. What is deliberately left configurable is the
**rules** — earn rate, point value, rank thresholds, category multipliers, rank
labels and commission basis points all live in the `loyalty_rules` row.

Changing the reward programme is an `UPDATE`, never a migration.

`DefaultLoyaltyEngine` mirrors the SQL exactly, so the app and the database never
disagree about a balance. `LoyaltyEngine` and `AffiliateTracker` are interfaces; swap
the implementation and every caller keeps working.

Referral capture: middleware reads `?ref=CARTEL-XXXX` into the first-party
`cartel_ref` cookie (30 days), read at onboarding for signup credit and again at
checkout for order credit.

---

## 11. Walk-in members (POS)

`members.id` references `auth.users(id)`. The service-role client bypasses RLS but
**cannot** bypass that foreign key, so a synthetic uuid will fail.

Two supported routes:

- **Create a real auth user first** via `auth.admin.createUser()` with a placeholder
  email and no password, then insert the member row with that id. Keeps one identity
  model and lets the walk-in claim the account later.
- **Sell without a member** — `process_cartel_order` fully supports
  `member_id: null`. The only cost is that `is_member_only` products reject the
  sale, which is arguably correct for an unverified walk-in.

Do **not** make `members.id` nullable or drop the FK. Every RLS policy keyed on
`auth.uid()` depends on it.

---

## 12. Environment

Copy `.env.example` to `.env.local`.

| Variable | Needed for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | Everything |
| `SUPABASE_SERVICE_ROLE_KEY` | Signed KYC URLs, Higgsfield webhook, walk-in creation |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Address autocomplete (browser; restrict by domain) |
| `GOOGLE_MAPS_SERVER_KEY` | Driving distance and ETA (server; restrict by IP) |
| `HIGGSFIELD_API_KEY` | Promo reel generation |
| `CARTEL_BANK_*` | Manual EFT instructions |

The app degrades rather than crashes when these are absent:
`isSupabaseServerConfigured()`, `isMapsConfigured()` and `isHiggsfieldConfigured()`
let each surface disable itself with a readable message.

### Higgsfield status

The MCP tool names are **unconfirmed**. `HIGGSFIELD_TOOL_SUBMIT` defaults to
`generate_video` and `HIGGSFIELD_TOOL_STATUS` to `get_job_status`; verify both
against the live server's `tools/list` before trusting them. Without an API key the
client throws `HiggsfieldNotConfiguredError` on use — surface it, do not swallow it.
Nothing ever reports media as generated when it was not.

---

## 13. Local development notes

- This project sits in **OneDrive**, whose file locks can abort an `npm install`
  mid-write and corrupt `node_modules`. Pause sync during installs, or move the repo
  out of the synced folder.
- Keep a `package-lock.json` so installs stop doing a full tree re-resolution.
- Do not run a dev server during an install.
- `npm install --package-lock-only` is **not** risk-free when `node_modules` is
  already out of step with `package.json` — it reads the installed tree as its
  starting point and will fail `ERESOLVE`.
