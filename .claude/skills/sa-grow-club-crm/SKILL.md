---
name: sa-grow-club-crm
description: Implement South African private cannabis club onboarding, 18+ age verification, KYC document storage, and member-gated catalogue access.
---
# SA Private Club Compliance & CRM Skill

## Onboarding & Verification Flow
1. **Public vs. Member State:** Unauthenticated visitors see the 3D Vault experience and brand story, but product pricing and checkout are locked behind the **"Join the Cartel (Private Member Onboarding)"** gate.
2. **Age & KYC Gate:**
   - Validate 18+ age requirement (supports 13-digit SA ID number automatic DOB parsing or Passport DOB).
   - Upload selfie + ID document to a private, RLS-protected Supabase Storage bucket (`kyc-documents`).
   - Generate a digital membership agreement signature and assign a unique **Cartel Member QR Code** (used for rapid lookup at the in-store POS tablet).
3. **CRM Profiles:** Track member status (`PENDING_KYC`, `ACTIVE_MEMBER`, `VIP`, `SUSPENDED`), preferred consumption formats (`g`, `ml`, `units`), lifetime value, and in-store vs. online order history.
