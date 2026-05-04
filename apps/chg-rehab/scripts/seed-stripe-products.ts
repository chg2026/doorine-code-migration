/**
 * Create the Starter / Operator / Enterprise products + monthly per-seat
 * prices in Stripe, and print the Price IDs. Set the printed values as
 * STRIPE_PRICE_STARTER / _OPERATOR / _ENTERPRISE secrets afterwards.
 *
 * Run once per Stripe environment (test mode, then live mode after switching
 * the STRIPE_SECRET_KEY):
 *
 *   npx tsx scripts/seed-stripe-products.ts
 *
 * Idempotent: looks up by metadata.plan and reuses if the product already
 * exists.
 */
import Stripe from "stripe";
import { PLAN_DEFAULTS, type PlanTier } from "../lib/stripe";

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error("STRIPE_SECRET_KEY not set");
    process.exit(1);
  }
  const stripe = new Stripe(key);

  const tiers: PlanTier[] = ["Starter", "Operator", "Enterprise"];
  const created: Record<string, string> = {};

  for (const plan of tiers) {
    const def = PLAN_DEFAULTS[plan];

    // Find or create the product.
    const search = await stripe.products.search({
      query: `metadata['plan']:'${plan}'`,
    });
    let product = search.data[0];
    if (!product) {
      product = await stripe.products.create({
        name: `CHG ${plan}`,
        description: def.description,
        metadata: { plan },
      });
      console.log(`created product ${plan}: ${product.id}`);
    } else {
      console.log(`reusing product ${plan}: ${product.id}`);
    }

    // Find or create the monthly per-seat price.
    const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
    const match = prices.data.find(
      (p) =>
        p.unit_amount === def.pricePerSeatCents &&
        p.recurring?.interval === "month" &&
        p.currency === "usd"
    );
    let priceId: string;
    if (match) {
      console.log(`reusing price ${plan}: ${match.id}`);
      priceId = match.id;
    } else {
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: def.pricePerSeatCents,
        currency: "usd",
        recurring: { interval: "month" },
        metadata: { plan },
      });
      console.log(`created price ${plan}: ${price.id}`);
      priceId = price.id;
    }
    created[plan] = priceId;
  }

  console.log("\nSet these env vars (Replit Secrets):");
  for (const plan of tiers) {
    console.log(`  STRIPE_PRICE_${plan.toUpperCase()}=${created[plan]}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
