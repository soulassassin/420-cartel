# 420 Cartel — Private Botanical Collective Platform

A full-stack luxury e-commerce, in-store Point of Sale (POS), and multi-unit inventory & CRM platform built for **420 Cartel** (Sandton Vault & Lounge, Johannesburg, South Africa).

---

## Architecture & Core Modules

| Surface | Route | Description |
| :--- | :--- | :--- |
| **01 · 3D Vault Showcase** | `/` | WebGL (`@react-three/fiber` + GSAP ScrollTrigger + Lenis) 60fps 3D vault door, rotating trichome/terpene showcase, and collective manifesto. |
| **02 · 18+ Onboarding & KYC** | `/onboarding` | South African 13-digit ID (YYMMDD + citizenship + Luhn mod-10 checksum) and international passport verification, KYC document hashing, Private Grow-Club Mandate signature, and instant QR pass issuance. |
| **03 · Private Dispensary** | `/shop` | Verified-member reserve catalogue with live vault stock gauges (`g`, `ml`, `units`), VIP tier pricing, and multi-unit crate drawer. |
| **04 · Checkout & Courier** | `/checkout` | Click & Collect (Sandton Vault) or Johannesburg Haversine radius delivery resolver (`resolve_delivery_zone`), loyalty points redemption, and ZAR settlement (Yoco, PayFast Instant EFT, Member Store Credit). |
| **05 · In-Store POS Terminal** | `/pos` | Counter touch interface with QR/SA ID member lookup, 60-second walk-in registration, custom scale weight / target-Rand calculator, split tender, and printable 80mm thermal receipts. |
| **06 · Master Batch Inventory & Higgsfield AI** | `/admin/inventory` | Multi-UOM master batch tracking (`GRAMS`, `MILLILITERS`, `UNITS`), FIFO stock deduction & manual adjustments, immutable movement ledger, and Higgsfield AI 9:16 promo video studio. |
| **07 · Member CRM & KYC Queue** | `/admin/crm` | KYC approval workflow, VIP status elevation, SA ID Luhn inspection, and member store credit ledger adjustments. |
| **08 · Loyalty & Affiliates** | `/admin/loyalty` | Configurable points accrual & rank thresholds (`INITIATE`, `SOLDIER`, `CAPO`, `CONSIGLIERE`), referral code commission rates, and credit/EFT commission settlement. |

---

## Dual-Mode Data Layer (`SUPABASE` + `LOCAL` Preview)

The platform features a unified data layer (`src/lib/data/source.ts`):
- **Live Supabase Mode (`SUPABASE`):** Activated automatically when `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are configured. All reads respect PostgreSQL Row-Level Security (RLS) and all writes execute atomically via `SECURITY DEFINER` RPCs (`process_cartel_order`, `adjust_batch_stock`, `submit_member_kyc`, `review_member_kyc`).
- **Zero-Config Preview Mode (`LOCAL`):** When deployed without Supabase credentials, the platform automatically falls back to `src/lib/demo/engine.ts` — an in-browser transactional engine seeded with South African products, master batches, delivery zones, and demo members (`CARTEL-0420`) that mirrors the exact FIFO batch allocation and loyalty rules of the SQL layer.

---

## Getting Started

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Typecheck, lint, and production build
npm run typecheck
npm run lint
npm run build
```

### Database Migrations (Supabase)

Apply the SQL migrations in `supabase/migrations/` in order:
1. `20261107000001_cartel_core.sql` — Enums, SA ID Luhn/DOB SQL functions, branches, staff, members, KYC documents
2. `20261107000002_cartel_inventory_orders.sql` — Products, variants, master batches, stock movements, delivery zones, orders, payments, loyalty & affiliate ledgers
3. `20261107000003_cartel_functions.sql` — Transactional RPCs (`process_cartel_order`, `adjust_batch_stock`, `submit_member_kyc`, etc.)
4. `20261107000004_cartel_rls_storage.sql` — Row-Level Security policies, column guards, and private KYC storage buckets
5. `20261107000005_cartel_storefront_part2.sql` — Stock board views, affiliate settlement RPCs, and Sandton Vault seed data
