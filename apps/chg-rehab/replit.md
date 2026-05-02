# CHG Software

Real estate rehab management SaaS. Production rebuild of the single-file HTML
prototype `CHG_Rehab_Logic_Handoff_Interactive_Prototype.html` (the
authoritative wireframe — CSS must match exactly).

## Key Modules

- **Underwriting** (`/underwriting`): Full-screen iframe of `public/underwriting-calc.html` (the 3228-line handoff HTML, `screen-calc` is active by default).
- **Pipeline** (`/pipeline`): Server component fetches DB deals → passes to `components/pipeline/PipelineView.tsx` client component. Board/List toggle, 5-column kanban (Identified→Offer Submitted→Under Contract→Due Diligence→Closed/Acquired), stats row, type/stage/team filters. DO NOT import `@prisma/client` in client components (causes hooks error).

## Stack

- **Framework:** Next.js 15 (App Router, Server Actions enabled) + React 19 + TypeScript
- **Database:** PostgreSQL via Prisma 6.19.3 (use `./node_modules/.bin/prisma`, NOT npx)
- **Auth:** Replit OIDC (`openid-client` v6) with iron-session (`chg_session` cookie)
- **File Storage:** Replit Object Storage (`@google-cloud/storage` + Uppy v5) — `lib/objectStorage.ts`
- **Upload Validation:** `lib/fileValidation.ts` (shared client+server constants/sync check) and `lib/serverFileValidation.ts` (server-only async check against GCS object metadata). Allowed types: PDF, JPG, PNG. Max size: 20 MB.
- **Billing:** Stripe (`stripe` SDK v22 + `@stripe/stripe-js` + `@stripe/react-stripe-js`) — `lib/stripe.ts`
- **Styling:** Verbatim prototype CSS in `app/globals.css` (hand-written class names from the wireframe — no Tailwind utility classes)

## Layout

```
app/
  layout.tsx, page.tsx, globals.css
  login/                                   OIDC sign-in page
  api/
    login, callback, logout                OIDC flow
    dev-login                              DEV-ONLY session minting helper (404 in prod)
    auth/user                              current user JSON
    objects, uploads                       object storage routes
    documents/{route.ts, [id]/promote, [id]/download}
    warehouse/{items, items/[id]/allocate, categories/[id], subcategories/[id], templates}
    admin/{settings, company, permissions, users, users/[id]}
    billing/{route.ts, setup-intent, payment-method, subscription, invoices}   Stripe-backed billing
    stripe/webhook                         Stripe webhook receiver (raw-body verified)
    invites/accept                         invite token landing → sets session token → /api/login
    cron/notifications-sweep               scheduled trigger for the notification sweep (CRON_SECRET-gated)
    draws/[id]/approve                     payment gate enforced here
    contacts/[id]/assign                   compliance gate enforced here
  rehab/
    page.tsx                               redirects to first project
    [projectId]/
      layout.tsx                           project bar + tab nav
      page.tsx                             redirects to /overview
      overview, sow, budget, schedule, checklist, documents, activity
  warehouse/{page.tsx, Client.tsx}         server fetch + client UI
  docs/{page.tsx, Client.tsx}
  admin/{page.tsx, Client.tsx}
components/
  rehab/
    ProjectBar, TabNav                     header + URL-driven tabs
    SowPhase                               SOW accordion (client)
    ChecklistPhase                         THE GATE — client component (toggle + release)
    DocUploadButton                        project doc upload trigger
    ActivityFeed                           filter sidebar + day grouping + composer
lib/
  prisma.ts                                shared PrismaClient
  session.ts                               iron-session config (chg_session)
  auth.ts                                  getCurrentUser, OIDC helpers
  permissions.ts                           can(user, feature, action) + cache
  companySettings.ts                       getCompanySettings (cached)
  docStatus.ts                             statusClass / statusLabel / formatDateET / getEffectiveDocStatusForCompany
  datetime.ts                              formatET (America/New_York timestamps)
  paymentGate.ts                           assertPaymentApprovable + the legacy gate helpers
  assignmentGate.ts                        assertContractorAssignable
  objectStorage.ts                         presigned PUT + streaming GET
  email.ts                                 sendInviteEmail (Replit Mail; admin gets the join link to forward)
  replitmail.ts                            Replit Mail blueprint (sends to authenticated Replit user — invites only)
  outboundEmail.ts                         arbitrary-recipient transport for notifications (Resend HTTP API; noop when RESEND_API_KEY/EMAIL_FROM unset)
  stripe.ts                                Stripe SDK helpers: isStripeConfigured, getStripe, getOrCreateStripeCustomer, loadOrCreateSubscription, syncFromStripeSubscription, plan/price-id mapping
  notifications/
    dispatch.ts                            dispatchNotification, isInQuietHours, flushPendingEmails — channel/event gate + email digest queue + external Contact recipients
    sweep.ts                               runNotificationSweep + runNotificationSweepForAllCompanies (active companies only)
    scheduler.ts                           in-process 15-min interval (started from instrumentation.ts)
  rehab/
    queries.ts                             loadProjectByCode, loadProjectActivity, loadProjectComplianceDocs, gatesForProject
    actions.ts                             server actions: toggleChecklistItem, releaseDraw, postNote, fileException, addProjectAddendum, uploadProjectDocument
middleware.ts                              iron-session gate (PUBLIC_PATHS allow-list)
instrumentation.ts                         Next.js boot hook → starts the in-process notification scheduler
scripts/
  notification-sweep.ts                    standalone CLI for Replit Scheduled Deployment
prisma/
  schema.prisma                            single source of truth for the DB
  seed.ts                                  CHG demo seed (CHG-2247 + warehouse 8 depts/24 sub/~195 items, ~44 docs, 18 perm rows)
```

## Modules

1. **Pipeline** — properties across stages (lead → sold)
2. **Rehab Manager** — projects, phases, scope of work, checklists, draws (Task #2 ✅)
3. **Property** — single property detail
4. **Contacts** — contractors, inspectors, lenders, agents (Task #3)
5. **Warehouse** — 8 depts / 24 subs / ~195 items, allocation, templates, category mgr (Task #4 ✅)
6. **Documents Hub** — 4 levels (Company / Property / Project / Contact), categories, status chips, search, promote (Task #4 ✅)
7. **Admin Settings** — 10 panels (general, timezone, users+permissions, rehab, warehouse, docs, compliance, contractor portal, notifications, billing); 18 × 4 permission matrix; auto-save settings; transactional permissions PUT (Task #4 ✅)

## Multi-Tenancy

Every business table has `companyId` FK. Every read filters by
`user.companyId` from the iron-session cookie. New users are auto-attached to
the seeded company as `Admin` on first OIDC callback. Admin-only routes
require `user.role === "Admin"`.

## Company Settings

`CompanySetting` model has typed columns + a `meta` Json bag for the long tail:
- `strictPaymentGate` — block draw approval unless every checklist item tied
  to the draw (phase-scoped or project-wide) is `Done` or `NA`. Enforced by
  `lib/paymentGate.assertPaymentApprovable({projectId, phaseId})`.
- `blockAssignmentIfDocsMissing` — block contractor assignment when the
  contact lacks valid compliance docs. Enforced by
  `lib/assignmentGate.assertContractorAssignable`. Requires at least one
  valid COI (insurance / general-liability / GL); License is required only
  for Contractor / Subcontractor / Inspector contact types (vendors and
  tenants are exempt).
- `expiryAlertThresholdDays` — drives Documents Hub status colors (default 60).
- `timezone` (default `America/New_York`), `dateFormat`, `projectIdPrefix`,
  `defaultProjectMode`, `warehouseLowStockThreshold`, `contractorPortalEnabled`.
- `meta` — feature flags, per diem rate, role gates, notifications/billing
  preferences, etc.

`PATCH /api/admin/settings` whitelists keys; `PATCH /api/admin/company` renames
the company (Admin only).

## Notifications

Admin Settings → Notifications panel writes per-event channel toggles to
`CompanySetting.meta.notifyEvents.<event>.{email,inApp}` plus
`notifyDigestFrequency`, `notifyQuietStart`, and `notifyQuietEnd`. Server
hooks fire `dispatchNotification(...)` from `lib/notifications/dispatch.ts`
on these events:

- `drawApprovals` — draw approve / reject (`/api/draws/[id]/approve`,
  `/api/draws/[id]/reject`, and `releaseDraw` server action)
- `docExpiry` — document upload that lands in the expiry window
  (`POST /api/documents`) plus a periodic sweep
- `allocations` — warehouse item allocate / return
  (`POST /api/warehouse/items/[id]/allocate`)
- `missingUpdates` — contractor cadence sweep (driven by
  `meta.contractorUpdateCadence` and `meta.missingUpdateEscalation`)
- `exceptions` — `fileException` server action

Each call resolves recipients (company admins + project assignees) and writes
into the `Notification` table per channel. In-app rows render in the bell UI
on the top nav (`components/NotificationBell.tsx` + `/api/notifications*`).
Email rows respect `notifyDigestFrequency` (Realtime / Hourly / Daily /
Weekly) and `notifyQuiet{Start,End}` quiet hours; non-realtime / quiet-hour
rows are queued `Pending` and flushed by `runNotificationSweep`. Urgent
events (rejected draws, expired docs, exceptions) bypass quiet hours.

The sweep is triggered three ways, all of which call
`runNotificationSweepForAllCompanies()` (active companies only — i.e. those
with no Subscription row or a Subscription whose status is one of
`active | trialing | past_due`):
- **In-process scheduler** (`instrumentation.ts` →
  `lib/notifications/scheduler.ts`): on Next.js server boot, registers a
  `setInterval` that fires every 15 minutes (override with
  `NOTIFICATIONS_SWEEP_INTERVAL_MS`, disable with
  `NOTIFICATIONS_SWEEP_DISABLED=1`). Always on; no env vars required.
  Per-company DB throttle prevents duplicate work across multiple instances.
- **External cron** (`GET|POST /api/cron/notifications-sweep`): for
  autoscale deployments that scale to zero between requests. Requires
  `CRON_SECRET` (Bearer token or `x-cron-secret` header) and refuses to run
  if the env var is not set. Wire this to a Replit Scheduled Deployment, an
  external pinger, etc.
- **Standalone script** (`scripts/notification-sweep.ts`): the same logic
  as the cron route but runnable as `npx tsx scripts/notification-sweep.ts`
  for use as a Replit Scheduled Deployment.
- **Backstop:** the bell GET (`/api/notifications`) still kicks off a
  fire-and-forget per-company sweep, throttled to ~5 min/company, so even
  a fully misconfigured schedule still gets opportunistic delivery.

**Production schedule (Task #27):** the autoscale web deployment scales to
zero between requests, so the in-process scheduler isn't reliable in prod.
The official trigger is a Replit **Scheduled Deployment** running every 15
minutes alongside the main autoscale deployment. The `CRON_SECRET` secret
is set on the Replit project (shared/global, so it's available in both the
web app and the scheduled deployment). Two equivalent ways to wire the
schedule (pick one):
1. **HTTP ping** (recommended — reuses the live web deployment, no extra
   build): scheduled run command =
   `bash -c 'curl -fsS -H "Authorization: Bearer $CRON_SECRET" "https://$REPLIT_DOMAINS/api/cron/notifications-sweep"'`
2. **Standalone script** (runs the sweep directly without HTTP, no
   running web app required): build = `npm install`, run =
   `npm run cron:notifications-sweep` (which is `tsx scripts/notification-sweep.ts`).
Either path logs a one-line JSON summary
(`{job, totalCompanies, failedCompanies, emailsSent, emailsFailed, ...}`)
visible in the Scheduled Deployment's logs.

Email delivery uses the outbound transport in `lib/outboundEmail.ts` (Resend
HTTP API, configured via `RESEND_API_KEY` + `EMAIL_FROM` secrets; degrades to a
logged noop when unset). The Reply-To header is taken from
`CompanySetting.meta.notifyReplyTo`. Per-user opt-out is `User.emailOptOut`
(default `false`) — opted-out users still receive in-app rows but no email.
Invite emails (`lib/email.ts → sendInviteEmail`) intentionally stay on Replit
Mail so the admin keeps a copy of the join link.

`dispatchNotification` accepts an optional `contactIds: string[]` to email
external `Contact` rows (contractors / subcontractors / vendors) directly via
the outbound transport — they have no in-app inbox, so these sends are
immediate and best-effort. Every attempt is logged on
`ContactNotificationLog` (status `Sent` or `Failed`) so admins can see bounces
in the UI. Draw approve / reject (`/api/draws/[id]/approve`,
`/api/draws/[id]/reject`) loop in the project's active contractors
automatically.

**Delivery problems** — when an email is rejected or bounces (provider error,
invalid recipient, missing email, etc.) the dispatcher persists a `Failed`
row with `failureReason` on either `Notification` (employee recipients) or
`ContactNotificationLog` (external contacts). Admins see a "Delivery
problems" list at the top of Admin Settings → Notifications powered by
`GET /api/admin/notification-failures`; each row links to the affected user
or contact so the address can be fixed and the next sweep retries.
Provider-not-configured and intentional opt-outs are intentionally not
logged as failures (the panel banner already covers transport config).
A collapsible "View resolved delivery problems" section under the live list
surfaces the audit history (auto-cleared vs. admin-dismissed, who resolved
and when) via `GET /api/admin/notification-failures?resolved=1`, paginated
with a `?before=<resolvedAt>` cursor so tenants with months of history stay
performant.

**Stale-sweep watchdog** — `evaluateStaleSweepAlerts()` in
`lib/notifications/sweep.ts` runs after every cron sweep (and from the
standalone script). For each active company whose `lastDigestSweepAt` is
older than the configured threshold (default 60 min), it emails every
Admin user (subject `[Company] Notification sweep is stalled …`) with a
link to Admin Settings → Notifications, then stamps
`NotificationState.lastStaleAlertAt`. Subsequent alerts are suppressed for
the configured throttle window (default 6 h) per company so admins are
not spammed during a prolonged outage. The throttle stamp is only
written when at least one admin email actually delivered, so transient
provider errors don't silently consume the throttle window. This is an
in-app watchdog: if the cron stops being invoked entirely, no email can
fire (an inherent limitation), but per-company sweep failures and DB
update failures are caught. The Admin → Notifications sweep banner reads
`lastStaleAlertAt` and the throttle window so admins can see whether
they have already been paged about the current outage and when another
alert may fire (or "No outage email sent yet" if none has gone out).

Both knobs are tunable per company via Admin Settings → Notifications →
"Outage alerts" (stored on `CompanySetting.meta.notifyStaleAlertThresholdMs`
and `notifyStaleAlertThrottleMs`, validated against
`STALE_THRESHOLD_BOUNDS_MS` (15 min – 24 h) and `STALE_THROTTLE_BOUNDS_MS`
(1 h – 7 d) in `app/api/admin/settings/route.ts`). When unset they fall
back to the global `NOTIFICATIONS_SWEEP_STALE_THRESHOLD_MS` /
`NOTIFICATIONS_SWEEP_STALE_THROTTLE_MS` env vars (themselves defaulting
to 60 min / 6 h). Each `StaleAlertCompanyResult` reports the effective
`thresholdMs` / `throttleMs` that was actually applied for that tenant,
and the same effective values feed the sweep banner so admins always
see the threshold/throttle their company is actually using.

**Weekly outage recap email** — `sendWeeklyOutageRecap()` in
`lib/notifications/sweep.ts` runs on every notifications-sweep cron tick
(both the HTTP route and the standalone script). For each active company
it sums the past 7 days of `StaleSweepAlertLog` rows and emails every
Admin user a digest showing total alerts, delivered/failed counts, and
the longest staleness window observed. Companies with zero alerts in the
window are skipped (no noise), and admins can opt out per company via
`CompanySetting.meta.notifyWeeklyAlertRecapDisabled` (Admin → Notifications
→ Outage alerts → "Weekly recap email" toggle). A per-company throttle
(`WEEKLY_RECAP_THROTTLE_MS` ≈ 6 d 23 h, stamped on
`NotificationState.lastWeeklyAlertRecapAt`) keeps the email firing at most
once per ~7 days even though the cron itself ticks every 15 min. The
throttle is only stamped after at least one admin email actually
delivered, so transient transport errors don't silently consume a week.

The recap cadence is **weekday-pinned**: `sendWeeklyOutageRecap` only
sends when both (a) the per-company throttle has expired AND (b) the
current day of the week (in the company timezone) matches the configured
weekday. The weekday is stored in
`CompanySetting.meta.notifyWeeklyAlertRecapWeekday` as a string from the
set `["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]`
and defaults to `"Monday"` when unset. Admins change it via Admin →
Notifications → Outage alerts → "Send recap on" selector (only visible
when the weekly recap toggle is enabled). The value is validated by
`app/api/admin/settings/route.ts` (400 if not in the allowed set).

The sweep banner also exposes a **"Run sweep now"** button (Admin only)
that POSTs to `/api/admin/notifications/run-sweep`, calling
`runNotificationSweep(companyId, { force: true })` immediately followed by
`evaluateStaleSweepAlerts()`, then refreshing the banner with the new
`lastDigestSweepAt` / `lastStaleAlertAt`. Useful for confirming a fix
(e.g. corrected `CRON_SECRET`, restarted scheduled deployment) without
waiting up to 15 min for the next cron tick. The route enforces a
per-company manual-run throttle (10 s, in-memory) and the button shows a
"Wait Ns" countdown so repeated clicks can't hammer the worker.

## Permissions

Two coexisting models:
- `PermissionMatrixRow` — feature/action/roles JSON used by `can()` for
  back-compat with task-2/3 routes. Cached in-process for 30 s; invalidate
  on write.
- `PermissionLabelRow` — prototype 18-row × 4-role label matrix
  (PM / GC / Sub / Inspector + Admin lock + locked rows). Edited via Admin
  UI; `PUT /api/admin/permissions` updates transactionally, rejects mutations
  on `locked` rows, and invalidates the `can()` cache.

Server actions and API routes enforce permissions before any mutation.

## Payment Gate (the heart of Task #2)

The contract: **the server is the single source of truth for gate state.**

1. `lib/paymentGate.ts → computeGate(phase, items, draw)` returns a
   serializable `PhaseGateState` (`isOpen`, `isReleased`, `releaseAmount`,
   plus a sanitized `GateDraw` projection — Decimals converted to numbers).
2. `lib/paymentGate.ts → canReleaseDraw(gate, strictPaymentGate)` returns
   the blocking reason or `{ ok: true }`.
3. `lib/paymentGate.ts → assertPaymentApprovable({projectId, phaseId})` is
   the Task #4 gate used by `POST /api/draws/[id]/approve`. It enforces
   `strictPaymentGate` against `ChecklistItem` status (Pending / Flagged →
   412 with the count).
4. Server actions in `lib/rehab/actions.ts` call `getPhaseGate(phaseId)`
   immediately before any mutation, then re-read the gate after writing
   and return the fresh state to the client.
5. `<ChecklistPhase>` is the only client component for the gate. It
   optimistic-toggles items, calls the server action, and replaces its
   local state with the server's authoritative response — never deciding
   gate state on its own.

A draw can only be released once. The release writes `Draw.status = Approved`,
sets `approvedAt + paidAt + approvedById`, and creates an `ActivityLogEntry`
with `meta.type = "payment"`. Once released, all checklist items lock.

## Activity Log

`ActivityLogEntry` is the audit log for the entire app. `meta.type`
discriminates between `system | note | payment | document | task | flag |
changeOrder`. The Activity tab groups entries by ET day (Today / Yesterday /
explicit dates), filters by type, and lets PMs post notes/tasks via the inline
composer. Change-order entries (`action = "changeOrder.requested"`) get their
own filter, color, and icon; both the Activity feed and Overview Recent
Activity render an inline "View Phase N in SOW →" deep link that scrolls to
and expands the affected phase via `?phase=N#sow-phase-N`. Legacy entries
written before this change had `meta.type = "task"`; the activity page coerces
them to `changeOrder` based on the action name so they pick up the new
treatment. (Note: the prisma delegate is `prisma.activityLogEntry`, not
`prisma.activity`.)

## Auth Flow

- `GET /api/login` — kicks off OIDC with PKCE
- `GET /api/callback` — completes OIDC, upserts user, returns to `next`
- `GET /api/logout` — ends session and Replit session
- `GET /api/auth/user` — current user info (401 if not signed in)
- `GET /api/dev-login?as=<userId>&next=<path>` — **DEV ONLY** — mints an
  iron-session for a seeded user. Returns 404 in production. Used for local
  smoke tests of auth-gated pages.

## Object Storage

- `POST /api/uploads` — returns `{ uploadURL, objectName }` (presigned PUT)
- Client `PUT`s the file directly to `uploadURL`
- `GET /api/objects/:path*` — serves uploaded files (auth required)
- `GET /api/documents/[id]/download` — private streaming download via
  `lib/objectStorage` helpers (no public redirect)
- `<ObjectUploader>` / `<DocUploadButton>` — Uppy v5 modal uploader

## Health Endpoint

`GET /api/health` returns a JSON snapshot for external uptime / status
monitors and Replit deployment health checks. The `services` block
includes:

- `database` — `up` / `down` (a `SELECT 1` round-trip)
- `objectStorage` — `up` / `down` — a real round-trip via
  `checkObjectStorageHealth()` in `lib/objectStorage.ts`: calls
  `bucket.exists()` on the bucket named by `DEFAULT_OBJECT_STORAGE_BUCKET_ID`.
  The call is wrapped in a `Promise.race` with a configurable timeout
  (default 3 s; override via `OBJECT_STORAGE_HEALTH_TIMEOUT_MS` env var).
  On timeout the check returns `{ ok: false, error: "health check timed out" }`
  so a hung sidecar never blocks the health endpoint indefinitely.
  Reports `down` (and includes an `objectStorageError` sibling) when the env
  var is missing, the sidecar credential proxy is unreachable, the bucket
  does not exist / is inaccessible, or the timeout fires.
- `replitAuth` — `configured` / `missing` (presence of `REPL_ID`)
- `unsubscribeLinks` — `ok` / `missing` from
  `getUnsubscribeLinkDiagnostic()` (`lib/contactUnsubscribe.ts`); when
  `missing`, a sibling `unsubscribeLinksReason` string explains why
  (typically "set `APP_BASE_URL`")

Top-level `status` is `degraded` and HTTP 503 whenever the database is
down, the object-storage round-trip fails, OR the unsubscribe-link
diagnostic reports missing.

**Deployment health check:** The Replit autoscale deployment (`.replit`
`[deployment]` section) is configured with `healthCheckPath = "/api/health"`.
Replit's deployment infrastructure probes this path and will stop routing
traffic to an instance that returns HTTP 503, which covers both database-down
and broken-unsubscribe-link conditions. Any external uptime monitor should
also target `GET /api/health` and alert on non-200 responses.

## Scripts

- `npm run dev` — start app (Next.js, port 5000, all hosts)
- `npm run db:push` — sync Prisma schema to Postgres (accept-data-loss)
- `npm run db:seed` — seed demo company + CHG-2247 with full project data
- `npm run db:generate` — regenerate Prisma client
- `npm run build` — `prisma generate && next build`
- `npm start` — production server
- `npm test` — run Vitest suite (config in `vitest.config.ts`, picks up
  `**/*.test.ts` and excludes `node_modules`, `.next`, `dist`, `.cache`).
  First test suite lives at
  `app/api/admin/notifications/run-sweep/route.test.ts` and mocks
  `@/lib/auth`, `@/lib/prisma`, and `@/lib/notifications/sweep`.

> ⚠️ Always invoke Prisma via `./node_modules/.bin/prisma`. The npx-resolved
> binary is broken in this Replit environment.

## Dev Cookie for curl

`node seal.mjs` (must run from project dir) → writes `/tmp/cookie.txt` for use
as `-b "$(cat /tmp/cookie.txt)"` to test as `seed-user-roey` /
`seed-company-chg`.

## Important Notes

- Prisma `Decimal` values must NOT be passed to client components. The
  `GateDraw` projection in `paymentGate.ts` exists to keep the gate state
  serializable across the server/client boundary.
- ChecklistItem status uses field name **`doneAt`** (not `completedAt`).
- `CompanySetting.strictPaymentGate` is the canonical Task #4 field name
  (the legacy `strictGate` getter has been removed).
- Project metadata lives in `Project.meta` JSON: `mode`, `pmLed`,
  `statusLabel`, `lastUpdated`, `penaltyPerDiem`, `penaltyStatus`,
  `penaltyAccrued`, `originalEndDate`.
- Document expiry is computed dynamically by
  `loadProjectComplianceDocs(project, thresholdDays, today?)` — never
  stored on the document row.
- All UI timestamps must go through `formatET()` — the prototype renders
  America/New_York times with the `ET` suffix.
- Prototype CSS is preserved verbatim (no Tailwind — hand-written class
  names from the wireframe). All admin/perm/toggle classes live in
  `app/globals.css`.
- `useSearchParams` in client components must be wrapped in `<Suspense>`
  at the page boundary (Next 15 requirement).
- The `meta` Json column on `CompanySetting` is the bag for long-tail flags
  so the schema doesn't need a migration for every new toggle.
- Billing state lives in its own `Subscription` row (one per company) and is
  written only by the Stripe routes / webhook — no longer in
  `CompanySetting.meta.billing`. The Admin → Billing & plan panel falls back
  to a "Connect Stripe" placeholder when these env vars are missing:
  `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`,
  `STRIPE_WEBHOOK_SECRET`, and the per-tier price IDs
  `STRIPE_PRICE_STARTER` / `_OPERATOR` / `_ENTERPRISE`. Run
  `npx tsx scripts/seed-stripe-products.ts` once per Stripe environment to
  create the products + prices and print the price IDs to set as secrets.
  Seat limits (driven by `Subscription.seatLimit`, defaulting to the plan
  tier when unconfigured) are enforced by `POST /api/admin/users` inside a
  Postgres advisory-locked transaction
  (`pg_advisory_xact_lock(hashtextextended(companyId, 0))`) so concurrent
  invite requests can't bust the cap; over-quota requests return
  `402 { code: "seat_limit_reached" }`. Per-seat invoicing: every plan
  change and every successful invite calls `syncSeatQuantity(companyId)`
  to push the live seat count to Stripe as the subscription item
  `quantity` (with `proration_behavior: "create_prorations"`).
  The Stripe webhook receiver lives at `/api/stripe/webhook` and must be
  in the middleware `PUBLIC_PATHS` allowlist (otherwise unauthenticated
  Stripe traffic is redirected to `/login` and webhooks silently
  no-op). Verified end-to-end against Stripe test mode by
  `scripts/smoke-stripe.ts` (dev-login → setup-intent → confirm with
  `pm_card_visa` → attach PM → create subscription → list invoices →
  forge signed `customer.subscription.updated` + `invoice.paid` events
  → seat-limit 402 check).

## Status

- **Foundation** ✅ (auth, multi-tenancy, permissions, schema, object storage)
- **Task #2 — Rehab Manager + payment gate** ✅
  - 7 tabs: Overview, SOW, Budget, Schedule, Checklist & Payments,
    Documents, Activity
  - Server-backed gate with strict + advisory modes
  - Dynamic COI expiry, ET timestamps, server-enforced permissions
- **Task #3 — Pipeline + Property + Contacts** ✅
- **Task #4 — Warehouse + Documents Hub + Admin Settings** ✅
  - 10 admin panels, 18 × 4 permission matrix
  - Strict payment gate wired to ChecklistItem completion
  - Compliance gate wired to ContractorComplianceDoc
  - Documents Hub with server-side filtering and four-level taxonomy
  - Warehouse with template field builder, locked-row schema guard, and
    category manager
- **Task #15 — Stripe billing** ✅
  - `Subscription` model + `lib/stripe.ts` helpers
  - `/api/billing/*` (config/setup-intent/payment-method/subscription/invoices)
    + `/api/stripe/webhook` keep local cache in sync
  - Plan tier drives Stripe Subscription; payment method captured via Stripe
    Elements; invoices live from Stripe
  - Seat limit enforced server-side on invite create
  - Clean "Connect Stripe" placeholder when env vars missing
- **Task #27 — Production notification schedule** ⏳ pending Publishing UI step
  - `CRON_SECRET` configured as a Replit Secret (global, available in both
    dev and prod)
  - `/api/cron/notifications-sweep` verified locally: 401 without auth,
    200 + JSON sweep summary with the bearer token
  - **Still required** (manual, in the Publishing tool, alongside the
    autoscale web deployment): create a Replit Scheduled Deployment with a
    15-minute cadence using either
    `bash -c 'curl -fsS -H "Authorization: Bearer $CRON_SECRET" "https://$REPLIT_DOMAINS/api/cron/notifications-sweep"'`
    or build=`npm install` + run=`npm run cron:notifications-sweep`, then
    trigger one run and confirm the JSON summary appears in the deployment
    logs. Mark this entry ✅ once that's confirmed.
- **Task #25 — App-wide billing status banner** ✅
  - `components/BillingStatusBanner.tsx` polls `/api/billing` every 60s and
    renders a persistent red banner above the main content when the
    subscription status is `past_due`, `unpaid`, `incomplete`,
    `incomplete_expired`, or `canceled`
  - Mounted in `app/layout.tsx` only for Admin users; hides itself when
    Stripe is not configured or the subscription is healthy
  - Banner links to `/admin?panel=billing`; body grid reworked to
    `auto 1fr` so the top stack (TopNav + banner) auto-sizes
- **Task #52 — Blocked-action explanation when billing breaks** ✅
  - `lib/billing-gate.ts` (server) — `billingBlockedResponse(companyId)`
    returns a 402 JSON `{ error, code: "billing_blocked" }` when
    `companyHasBillingIssue` is true; gated endpoints early-return it after
    auth/role checks
  - Gated routes: `POST /api/admin/users` (invite), `POST /api/pipeline/deals`,
    `POST /api/properties`, `POST /api/properties/[id]/start-project`,
    `POST /api/documents`, `POST /api/warehouse/items`, and
    `POST /api/contacts/[id]/assign`
  - `lib/billing-blocked-client.ts` (client) — `isBillingBlockedResponse`,
    `notifyBillingBlocked` (dispatches `billing:refresh` window event), and
    `billingAwareErrorMessage(status, body, fallback)` which substitutes the
    friendly copy and pings the badge
  - `BillingNavBadge` and `BillingNavIndicator` listen for `billing:refresh`
    so the top-nav stays in sync with the inline error users just saw
- **Task #64 — Extend billing-broken block to remaining teammate write actions** ✅
  - Additional gated routes (each calls `billingBlockedResponse(user.companyId)`
    immediately after the auth + role check):
    - Property edits: `PATCH /api/properties/[id]` (financials),
      `POST /api/properties/[id]/status` (status change),
      `POST /api/properties/[id]/assets` (add asset),
      `PATCH /api/properties/[id]/assets/[assetId]` (edit asset),
      `POST /api/properties/[id]/documents` (property doc upload)
    - Pipeline progression: `POST /api/pipeline/deals/[id]/advance`,
      `POST /api/pipeline/deals/[id]/close`
    - Warehouse mutations: `POST /api/warehouse/items/[id]/allocate`,
      `PATCH /api/warehouse/categories/[id]`,
      `PATCH /api/warehouse/subcategories/[id]`,
      `POST /api/warehouse/templates`, `PATCH /api/warehouse/templates`
    - Draws: `POST /api/draws/[id]/approve`, `POST /api/draws/[id]/reject`
      (the in-app release flow uses the `releaseDraw` server action — see
      "Intentionally exempt" below — but these REST endpoints exist and are
      still gated for parity)
    - Documents: `POST /api/documents/[id]/promote`
  - Client error handlers updated to route 402 responses through
    `billingAwareErrorMessage` so the inline copy + nav-badge refresh stay
    consistent: `app/property/PropertyActions.tsx` (status, financials, asset,
    upload), `app/pipeline/DealActions.tsx` (advance + close),
    `app/warehouse/Client.tsx` (allocate), `app/docs/Client.tsx` (promote)
  - Intentionally exempt:
    - `lib/rehab/actions.ts` server actions (`releaseDraw`, `postNote`,
      `requestChangeOrder`, `uploadProjectDocument`, `addProjectAddendum`,
      `setPmLed`, etc.) — server actions, not REST routes, and outside the
      billing-gate helper's `NextResponse` shape. A follow-up could introduce
      a parallel server-action helper that throws a typed `BillingBlockedError`.
    - `app/warehouse/Client.tsx` template-library and category-manager mutation
      buttons (`/api/warehouse/templates`, `/api/warehouse/categories/[id]`,
      `/api/warehouse/subcategories/[id]`). The server is fully gated, but the
      existing modal code fires-and-forgets without surfacing any error; rather
      than rewrite those flows here we left the no-op error path. The persistent
      `BillingStatusBanner` (Task #25) still tells the admin what's wrong.
    - All `GET` / read endpoints, `/api/billing/*` (the billing-fix surface
      itself), webhook endpoints, and the `/api/admin/*` internal routes that
      exist solely to repair the billing or seat configuration.

- **Task #31 — Email admins immediately on billing problems** ✅
  - `lib/notifications/billing.ts` exports `notifyAdminsOfBillingIssue` and
    `notifyAdminsOfBillingRecovery`. For every admin in the company it upserts
    an urgent in-app `Notification` row (so the bell shows it) and sends a
    Resend email via `sendOutboundEmail` pointing at `/admin?panel=billing`.
    These are transactional-critical alerts so `User.emailOptOut` is
    intentionally bypassed (admins are the only people who can fix billing).
    Missing transport (`RESEND_API_KEY`/`EMAIL_FROM`) just logs and the
    in-app row is still created.
  - Dedupe: bucket is `latest_invoice.id` when available (else
    `currentPeriodEnd`/`stripeSubscriptionId`), so the subscription-transition
    path and the `invoice.payment_failed` path collapse to ONE email per
    admin per incident. Recovery uses a separate dedupe namespace.
  - `app/api/stripe/webhook/route.ts` reads the prior local `Subscription.status`
    before `syncFromStripeSubscription`, then fires the issue alert on
    healthy→unhealthy and a one-time recovery alert on unhealthy→healthy.
    `invoice.payment_failed` additionally fires when the sub is already
    unhealthy (per-invoice retries that don't generate a new sub-status webhook).
