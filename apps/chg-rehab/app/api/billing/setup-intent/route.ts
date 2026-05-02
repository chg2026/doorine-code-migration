import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  getOrCreateStripeCustomer,
  isStripeConfigured,
  requireStripe,
} from "@/lib/stripe";

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isStripeConfigured())
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });

  const company = await prisma.company.findUnique({ where: { id: user.companyId } });
  const customerId = await getOrCreateStripeCustomer(user.companyId, {
    email: user.email,
    name: company?.name ?? null,
  });

  const stripe = requireStripe();
  const intent = await stripe.setupIntents.create({
    customer: customerId,
    payment_method_types: ["card"],
    usage: "off_session",
  });

  return NextResponse.json({
    clientSecret: intent.client_secret,
    customerId,
  });
}
