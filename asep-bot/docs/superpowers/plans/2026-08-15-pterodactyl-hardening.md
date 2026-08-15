# Pterodactyl Hardening & ASEP BOT Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Pterodactyl 403/key-mapping failures and provisioning cleanup, improve panel diagnostics, and make all storefront/admin branding consistently ASEP BOT.

**Architecture:** Add a focused Pterodactyl utility module for key classification, safe API error parsing, egg environment extraction, and request validation. Route handlers use this module for settings normalization, preflight tests, and provisioning with cleanup. UI keeps the current layout but shows actionable diagnostics and ASEP BOT branding.

**Tech Stack:** Next.js 16, React 19, TypeScript, Node.js 22, built-in `node:test`, Pterodactyl Application/Client APIs, SQLite/Turso adapter.

## Global Constraints

- Preserve current checkout/payment behavior unless required for correctness.
- Never expose full API keys in responses or logs.
- Application API keys must be `ptla_...`; Client API keys must be `ptlc_...` when prefixes are available.
- Paid orders must not be marked active until both Pterodactyl user and server creation succeed.
- If user creation succeeds and server creation fails, attempt cleanup of the temporary user.
- Keep existing Vercel/Turso support and warn when production persistence/secrets are not configured.
- Brand visible UI and provisioning identity as ASEP BOT.

---

### Task 1: Pterodactyl key and error utilities

**Files:**
- Create: `lib/pterodactyl-utils.ts`
- Test: `tests/pterodactyl-utils.test.mjs`

**Interfaces:**
- Produces: `normalizePanelKeys(appKey, clientKey)`, `readApiError(response, fallback)`, `extractEggEnvironment(egg)`, `validatePanelBaseUrl(url)`.

- [ ] Write failing tests for swapped PTLA/PTLC, invalid prefixes, API error parsing, and egg environment extraction.
- [ ] Run `node --experimental-strip-types --test tests/pterodactyl-utils.test.mjs` and verify failure.
- [ ] Implement utilities with no credential leakage.
- [ ] Re-run the test and verify pass.

### Task 2: Safe settings normalization and diagnostics

**Files:**
- Modify: `app/api/asep/route.ts`
- Test: `tests/pterodactyl-utils.test.mjs`

**Interfaces:**
- Consumes: Task 1 utilities.
- Produces: settings save that automatically swaps clearly reversed PTLA/PTLC values; `test-pterodactyl` returns structured application/client/egg/location checks.

- [ ] Add regression tests for settings key normalization behavior in the utility layer.
- [ ] Normalize panel keys before sealing settings.
- [ ] Expand preflight to Application users, Client account (when configured), Egg, and Location.
- [ ] Return actionable HTTP/API error details without returning secrets.

### Task 3: Provisioning hardening

**Files:**
- Modify: `app/api/asep/route.ts`
- Test: `tests/pterodactyl-utils.test.mjs`

**Interfaces:**
- Consumes: Task 1 utilities and existing order/product/settings data.
- Produces: provisioning that verifies configuration, fetches egg environment defaults, creates ASEP BOT users/servers, and cleans temporary users after server failure.

- [ ] Fetch egg metadata before server create and derive required/default environment variables.
- [ ] Use `ASEP` / `BOT` as Pterodactyl first/last names.
- [ ] On server failure, DELETE the newly created user and append cleanup status to the error.
- [ ] Preserve configuration-required behavior when panel settings are incomplete.

### Task 4: ASEP BOT branding and admin UX

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/shop-client.tsx`
- Modify: `app/admin/admin-client.tsx`
- Modify: `lib/asep-store.ts`
- Modify: `db/index.ts`
- Modify: `README-VERCEL.md`

**Interfaces:**
- Produces: ASEP BOT visible branding and clearer owner guidance.

- [ ] Replace FallZx/FZ visible defaults and placeholders with ASEP BOT/AB.
- [ ] Update admin panel test result display to show structured checks.
- [ ] Update Vercel runtime warnings for APP_SECRET and temporary SQLite.
- [ ] Rename temporary Vercel database file to ASEP BOT naming.

### Task 5: Verification and packaging

**Files:**
- All modified source files.

- [ ] Run utility tests.
- [ ] Run `npm install` from lockfile if available.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Search for remaining visible `FallZx`/`FZ` branding and fix relevant occurrences.
- [ ] Zip the project as `/mnt/data/ASEP-BOT-WEB-FIXED-2026.zip` and run `unzip -t`.
