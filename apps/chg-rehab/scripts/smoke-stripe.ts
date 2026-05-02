/**
 * End-to-end smoke test for the Stripe billing flow.
 *
 * Drives the live HTTP API against a real Stripe test-mode account using
 * Stripe's built-in `pm_card_visa` test PaymentMethod token (this stands in
 * for the Stripe Elements / confirmCardSetup step that the browser would do).
 *
 * Steps:
 *   1) dev-login as the seeded Admin and capture the session cookie
 *   2) GET /api/billing  -> verify config flags
 *   3) POST /api/billing/setup-intent  -> verify it returns a client secret
 *   4) Confirm the SetupIntent server-side with pm_card_visa
 *   5) POST /api/billing/payment-method  -> attach + cache (verify via DB)
 *   6) POST /api/billing/subscription { plan: "Operator" }  -> active sub
 *   7) GET /api/billing/invoices  -> verify Stripe invoices list
 *   8) Forge a Stripe-signed webhook event for customer.subscription.updated
 *      and POST it to /api/stripe/webhook -> verify DB row reflects update
 *   9) Forge an invoice.paid event -> verify activity log entry
 *  10) Seat limit: temporarily set seatLimit to current usage, invite one
 *      more user, expect HTTP 402 with code "seat_limit_reached"; restore.
 */
import Stripe from "stripe";
import { prisma } from "../lib/prisma";

const ORIGIN = process.env.SMOKE_ORIGIN || "http://localhost:5000";
const ADMIN_USER_ID = process.env.SMOKE_ADMIN_ID || "seed-user-roey";

function fail(msg: string): never {
  console.error(`\nFAIL: ${msg}`);
  process.exit(1);
}
function pass(msg: string) {
  console.log(`PASS: ${msg}`);
}
function info(msg: string) {
  console.log(`   - ${msg}`);
}

async function main() {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripeKey) fail("STRIPE_SECRET_KEY missing");
  if (!webhookSecret) fail("STRIPE_WEBHOOK_SECRET missing");
  if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
    fail("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY missing");
  if (!process.env.STRIPE_PRICE_OPERATOR) fail("STRIPE_PRICE_OPERATOR missing");
  const stripe = new Stripe(stripeKey);

  // ---------- 1) dev-login ----------
  console.log("\n[1] dev-login as", ADMIN_USER_ID);
  const loginRes = await fetch(
    `${ORIGIN}/api/dev-login?as=${encodeURIComponent(ADMIN_USER_ID)}&next=/admin`,
    { method: "GET", headers: { "User-Agent": "smoke-test/1.0" }, redirect: "manual" }
  );
  const setCookie = loginRes.headers.get("set-cookie");
  if (!setCookie) fail(`dev-login did not return a session cookie. status=${loginRes.status}`);
  const m = /chg_session=[^;]+/.exec(setCookie!);
  if (!m) fail("could not find chg_session in Set-Cookie");
  const cookie = m[0];
  pass(`logged in (status ${loginRes.status})`);

  const adminUser = await prisma.user.findUnique({ where: { id: ADMIN_USER_ID } });
  if (!adminUser) fail(`Seeded admin user ${ADMIN_USER_ID} not found in DB`);
  if (adminUser.role !== "Admin") fail(`User ${ADMIN_USER_ID} is not Admin (role=${adminUser.role})`);
  info(`companyId = ${adminUser.companyId}`);
  const companyId = adminUser.companyId!;

  const authedFetch = (path: string, init: RequestInit = {}) =>
    fetch(`${ORIGIN}${path}`, {
      ...init,
      headers: {
        "User-Agent": "smoke-test/1.0",
        cookie,
        "content-type": "application/json",
        ...(init.headers || {}),
      },
    });

  // ---------- 2) GET /api/billing ----------
  console.log("\n[2] GET /api/billing");
  const billingRes = await authedFetch("/api/billing");
  if (!billingRes.ok) fail(`/api/billing -> ${billingRes.status}: ${await billingRes.text()}`);
  const billing = await billingRes.json();
  if (!billing.config?.configured) fail("config.configured is false");
  if (!billing.config?.publishableKey) fail("config.publishableKey missing");
  for (const tier of ["Starter", "Operator", "Enterprise"] as const) {
    if (!billing.config.pricesConfigured[tier]) fail(`pricesConfigured.${tier} false`);
  }
  pass(`billing config OK (publishableKey starts with ${billing.config.publishableKey.slice(0, 8)}...)`);
  info(`seats in use: ${billing.subscription.seatsInUse}, seatLimit: ${billing.subscription.seatLimit}`);

  // ---------- 3) Create SetupIntent ----------
  console.log("\n[3] POST /api/billing/setup-intent");
  const siRes = await authedFetch("/api/billing/setup-intent", { method: "POST" });
  if (!siRes.ok) fail(`setup-intent -> ${siRes.status}: ${await siRes.text()}`);
  const si = await siRes.json();
  if (!si.clientSecret) fail("setup-intent did not return clientSecret");
  if (!si.customerId) fail("setup-intent did not return customerId");
  pass(`SetupIntent created (customer ${si.customerId})`);

  // ---------- 4) Confirm SetupIntent server-side with pm_card_visa ----------
  console.log("\n[4] Confirming SetupIntent with pm_card_visa");
  const setupIntentId = si.clientSecret.split("_secret_")[0];
  const confirmed = await stripe.setupIntents.confirm(setupIntentId, {
    payment_method: "pm_card_visa",
  });
  if (confirmed.status !== "succeeded") fail(`SetupIntent status = ${confirmed.status}`);
  const pmId =
    typeof confirmed.payment_method === "string"
      ? confirmed.payment_method
      : confirmed.payment_method?.id;
  if (!pmId) fail("SetupIntent had no payment_method after confirm");
  pass(`SetupIntent succeeded -> ${pmId}`);

  // ---------- 5) Attach payment method via app endpoint ----------
  console.log("\n[5] POST /api/billing/payment-method (attach + set default)");
  const attachRes = await authedFetch("/api/billing/payment-method", {
    method: "POST",
    body: JSON.stringify({ paymentMethodId: pmId }),
  });
  if (!attachRes.ok) fail(`payment-method -> ${attachRes.status}: ${await attachRes.text()}`);
  const attach = await attachRes.json();
  if (!attach.ok) fail(`payment-method response not ok: ${JSON.stringify(attach)}`);
  const subAfterAttach = await prisma.subscription.findUnique({ where: { companyId } });
  if (!subAfterAttach?.paymentMethodLast4)
    fail(`DB subscription.paymentMethodLast4 not cached after attach`);
  pass(
    `payment method attached + cached (brand=${subAfterAttach.paymentMethodBrand}, last4=${subAfterAttach.paymentMethodLast4})`
  );

  // ---------- 6) Subscribe to Operator plan ----------
  console.log("\n[6] POST /api/billing/subscription { plan: 'Operator' }");
  const subRes = await authedFetch("/api/billing/subscription", {
    method: "POST",
    body: JSON.stringify({ plan: "Operator" }),
  });
  if (!subRes.ok) fail(`subscription -> ${subRes.status}: ${await subRes.text()}`);
  const subResp = await subRes.json();
  if (!subResp.ok) fail(`subscription response not ok: ${JSON.stringify(subResp)}`);
  if (subResp.plan !== "Operator") fail(`response plan=${subResp.plan}`);
  if (!["active", "trialing", "incomplete", "incomplete_expired"].includes(subResp.status))
    fail(`unexpected status: ${subResp.status}`);
  info(`response: plan=${subResp.plan} status=${subResp.status} seatLimit=${subResp.seatLimit}`);
  const subAfterSubscribe = await prisma.subscription.findUnique({ where: { companyId } });
  if (!subAfterSubscribe?.stripeSubscriptionId)
    fail("DB subscription.stripeSubscriptionId still missing after subscribe");
  if (subAfterSubscribe.plan !== "Operator")
    fail(`DB plan=${subAfterSubscribe.plan} (expected Operator)`);
  pass(
    `subscription created (${subAfterSubscribe.stripeSubscriptionId}, db.status=${subAfterSubscribe.status})`
  );
  const stripeSubId = subAfterSubscribe.stripeSubscriptionId!;

  // ---------- 6b) Stuck-checkout recovery flow ----------
  // Simulate the admin closing the browser dialog before Stripe.js confirmed
  // the inline PaymentIntent: we deliberately skip using the
  // `latestInvoiceClientSecret` returned by POST /api/billing/subscription
  // and roll the DB row to `incomplete` so the BillingPanel "Confirm payment"
  // banner has work to do. Then we exercise the recovery endpoint the banner
  // calls (POST /api/billing/subscription/confirm), confirm the returned PI
  // server-side (the Stripe.js step), and sync via the same endpoint the
  // banner uses (POST /api/billing/subscription/sync).
  //
  // On a fresh run Stripe creates the sub with payment_behavior=default_
  // incomplete, so a confirmable PI exists. On reruns the existing sub may
  // already be `active` on the Stripe side (the API endpoint hits the update
  // path, not create), in which case there is no PI to recover. We detect
  // that and skip the PI-confirm leg with a clear message rather than
  // failing for environmental reasons.
  console.log("\n[6b] Stuck-checkout recovery: /confirm -> PI confirm -> /sync");
  const liveBeforeRecovery = await stripe.subscriptions.retrieve(stripeSubId);
  const recoveryRunnable =
    liveBeforeRecovery.status === "incomplete" ||
    liveBeforeRecovery.status === "incomplete_expired";
  info(`live Stripe sub status before recovery: ${liveBeforeRecovery.status}`);

  if (recoveryRunnable) {
    // Force the DB into `incomplete` so the recovery endpoint's status guard
    // matches what the banner sees in the wild (and so reruns where prior
    // state lingered are deterministic).
    await prisma.subscription.update({
      where: { companyId },
      data: { status: "incomplete" },
    });
    const recoverRes = await authedFetch("/api/billing/subscription/confirm", {
      method: "POST",
    });
    if (!recoverRes.ok)
      fail(
        `subscription/confirm -> ${recoverRes.status}: ${await recoverRes.text()}`
      );
    const recover = (await recoverRes.json()) as { clientSecret?: string };
    if (!recover.clientSecret)
      fail(`subscription/confirm did not return clientSecret: ${JSON.stringify(recover)}`);
    const recoverPiId = String(recover.clientSecret).split("_secret_")[0];
    if (!recoverPiId.startsWith("pi_"))
      fail(`recovered clientSecret does not look like a PI secret: ${recover.clientSecret}`);
    pass(`/confirm returned PI client_secret (${recoverPiId})`);

    const recoveredPi = await stripe.paymentIntents.confirm(recoverPiId);
    if (!["succeeded", "processing", "requires_capture"].includes(recoveredPi.status))
      fail(`PaymentIntent.confirm (recovery) returned status=${recoveredPi.status}`);
    pass(`recovered PaymentIntent confirmed (status=${recoveredPi.status})`);

    // The banner immediately POSTs /api/billing/subscription/sync after a
    // successful confirmCardPayment so the row flips to Active without
    // waiting for the customer.subscription.updated webhook to round-trip.
    await new Promise((r) => setTimeout(r, 500));
    const syncRes = await authedFetch("/api/billing/subscription/sync", {
      method: "POST",
    });
    if (!syncRes.ok)
      fail(`subscription/sync -> ${syncRes.status}: ${await syncRes.text()}`);
    const syncBody = (await syncRes.json()) as { ok?: boolean; status?: string };
    if (!syncBody.ok) fail(`sync response not ok: ${JSON.stringify(syncBody)}`);
    if (syncBody.status !== "active")
      fail(`sync returned status=${syncBody.status} (expected active)`);
    const subAfterRecovery = await prisma.subscription.findUnique({ where: { companyId } });
    if (subAfterRecovery?.status !== "active")
      fail(`expected DB status=active after recovery, got ${subAfterRecovery?.status}`);
    pass(`recovery flow flipped sub to active (db.status=${subAfterRecovery.status})`);
  } else {
    info(
      `skipping PI-confirm leg: Stripe sub already ${liveBeforeRecovery.status} (likely a rerun against an existing tenant)`
    );
    // Still verify /sync round-trips cleanly so we exercise the banner's
    // post-confirm path even when there is no PI to confirm.
    const syncRes = await authedFetch("/api/billing/subscription/sync", {
      method: "POST",
    });
    if (!syncRes.ok)
      fail(`subscription/sync -> ${syncRes.status}: ${await syncRes.text()}`);
    const syncBody = (await syncRes.json()) as { ok?: boolean; status?: string };
    if (!syncBody.ok) fail(`sync response not ok: ${JSON.stringify(syncBody)}`);
    pass(`/sync round-tripped (status=${syncBody.status})`);
  }

  // ---------- 6c) /confirm refuses to run when sub is already active ----------
  console.log("\n[6c] POST /api/billing/subscription/confirm rejects active subs with 400");
  const noopRes = await authedFetch("/api/billing/subscription/confirm", {
    method: "POST",
  });
  if (noopRes.status !== 400)
    fail(
      `expected 400 from /confirm when sub is active, got ${noopRes.status}: ${await noopRes.text()}`
    );
  const noopBody = (await noopRes.json()) as { error?: string };
  if (!noopBody.error || !/active|no payment confirmation needed/i.test(noopBody.error))
    fail(`unexpected 400 body from /confirm: ${JSON.stringify(noopBody)}`);
  pass(`/confirm returned 400 with message: ${noopBody.error}`);

  // ---------- 7) GET invoices ----------
  console.log("\n[7] GET /api/billing/invoices");
  const invRes = await authedFetch("/api/billing/invoices");
  if (!invRes.ok) fail(`invoices -> ${invRes.status}: ${await invRes.text()}`);
  const inv = await invRes.json();
  if (!Array.isArray(inv.invoices)) fail(`invoices payload missing: ${JSON.stringify(inv)}`);
  if (inv.invoices.length === 0) fail("no invoices returned (expected at least one for the new sub)");
  const first = inv.invoices[0];
  pass(
    `got ${inv.invoices.length} invoice(s); first: status=${first.status}, amountDue=${first.amountDue ?? first.amount_due}`
  );

  // ---------- 7b) Verify the subscription is active without out-of-band actions ----------
  console.log("\n[7b] Verify subscription reached active without invoice.pay");
  const subAfterCheckout = await prisma.subscription.findUnique({ where: { companyId } });
  if (subAfterCheckout?.status !== "active")
    fail(
      `expected DB status=active after client-side confirm, got ${subAfterCheckout?.status}`
    );
  pass(`DB row active: status=${subAfterCheckout.status}, plan=${subAfterCheckout.plan}`);

  // ---------- 8) Webhook: customer.subscription.updated ----------
  console.log("\n[8] POST /api/stripe/webhook customer.subscription.updated");
  // Mark our own DB row as 'past_due' first; the webhook should sync it back.
  await prisma.subscription.update({
    where: { companyId },
    data: { status: "past_due" },
  });
  const live = await stripe.subscriptions.retrieve(stripeSubId, {
    expand: ["items.data.price.product", "default_payment_method"],
  });
  const evtBody = JSON.stringify({
    id: `evt_smoke_${Date.now()}`,
    object: "event",
    api_version: "2024-06-20",
    created: Math.floor(Date.now() / 1000),
    type: "customer.subscription.updated",
    data: { object: live },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
  });
  const sigHeader = stripe.webhooks.generateTestHeaderString({
    payload: evtBody,
    secret: webhookSecret!,
  });
  const whRes = await fetch(`${ORIGIN}/api/stripe/webhook`, {
    method: "POST",
    headers: {
      "User-Agent": "smoke-test/1.0",
      "stripe-signature": sigHeader,
      "content-type": "application/json",
    },
    body: evtBody,
  });
  if (!whRes.ok) fail(`webhook -> ${whRes.status}: ${await whRes.text()}`);
  pass(`webhook accepted (${whRes.status})`);
  const synced = await prisma.subscription.findUnique({ where: { companyId } });
  if (!synced) fail("subscription row vanished");
  if (synced.status === "past_due") fail("DB still shows past_due -> webhook did not sync");
  if (synced.stripeSubscriptionId !== stripeSubId) fail("stripeSubscriptionId mismatch");
  pass(`DB row resynced by webhook: status=${synced.status}, plan=${synced.plan}`);

  // ---------- 9) Webhook: invoice.paid ----------
  console.log("\n[9] POST /api/stripe/webhook invoice.paid");
  const invoices = await stripe.invoices.list({ customer: si.customerId, limit: 1 });
  if (invoices.data.length === 0) fail("no invoice found to forge invoice.paid event");
  const invoice = invoices.data[0];
  const beforeLog = await prisma.activityLogEntry.count({
    where: { companyId, action: { startsWith: "billing_" } },
  });
  const invEvtBody = JSON.stringify({
    id: `evt_smoke_inv_${Date.now()}`,
    object: "event",
    api_version: "2024-06-20",
    created: Math.floor(Date.now() / 1000),
    type: "invoice.paid",
    data: { object: invoice },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
  });
  const invSig = stripe.webhooks.generateTestHeaderString({
    payload: invEvtBody,
    secret: webhookSecret!,
  });
  const invWhRes = await fetch(`${ORIGIN}/api/stripe/webhook`, {
    method: "POST",
    headers: {
      "User-Agent": "smoke-test/1.0",
      "stripe-signature": invSig,
      "content-type": "application/json",
    },
    body: invEvtBody,
  });
  if (!invWhRes.ok) fail(`invoice webhook -> ${invWhRes.status}: ${await invWhRes.text()}`);
  pass(`invoice webhook accepted (${invWhRes.status})`);
  const afterLog = await prisma.activityLogEntry.count({
    where: { companyId, action: { startsWith: "billing_" } },
  });
  if (afterLog <= beforeLog)
    fail(`expected new billing_* activity log row, got before=${beforeLog} after=${afterLog}`);
  pass(`activity log entries grew: ${beforeLog} -> ${afterLog}`);

  // ---------- 10) Seat limit -> 402 ----------
  console.log("\n[10] Seat-limit invite returns 402 seat_limit_reached");
  const usage = await prisma.user.count({ where: { companyId } });
  const pendingInvites = await prisma.invite.count({ where: { companyId, status: "Pending" } });
  const seatsUsed = usage + pendingInvites;
  info(`seats currently in use: ${seatsUsed} (users=${usage}, pendingInvites=${pendingInvites})`);

  const subBefore = await prisma.subscription.findUnique({ where: { companyId } });
  const originalSeatLimit = subBefore!.seatLimit;
  // Lower seatLimit so the next invite would exceed cap.
  await prisma.subscription.update({
    where: { companyId },
    data: { seatLimit: seatsUsed },
  });
  info(`temporarily lowered seatLimit ${originalSeatLimit} -> ${seatsUsed}`);

  const inviteEmail = `smoke-seat-limit-${Date.now()}@example.com`;
  let seatTestErr: unknown;
  try {
    const inviteRes = await authedFetch("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email: inviteEmail,
        firstName: "Seat",
        lastName: "Limit",
        role: "ProjectManager",
      }),
    });
    if (inviteRes.status !== 402) {
      seatTestErr = `expected 402, got ${inviteRes.status}: ${await inviteRes.text()}`;
    } else {
      const body = await inviteRes.json();
      if (body?.code !== "seat_limit_reached") {
        seatTestErr = `wrong code: ${JSON.stringify(body)}`;
      } else {
        pass(`invite blocked with 402 code="seat_limit_reached"`);
      }
    }
  } finally {
    // Restore seatLimit + cleanup any invite that snuck through.
    await prisma.subscription.update({
      where: { companyId },
      data: { seatLimit: originalSeatLimit },
    });
    info(`restored seatLimit to ${originalSeatLimit}`);
    await prisma.invite
      .deleteMany({ where: { companyId, email: inviteEmail } })
      .catch(() => {});
  }
  if (seatTestErr) fail(String(seatTestErr));

  console.log("\nAll Stripe billing smoke checks passed.");
}

main()
  .catch((err) => {
    console.error("\nUnhandled error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
