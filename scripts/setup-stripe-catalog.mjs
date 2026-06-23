import { Stripe } from "stripe";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });


// Initialize Stripe (requires STRIPE_SECRET_KEY in env)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-04-10" });

const catalog = [
  {
    id: "personal",
    name: "Solo Agent",
    price_usd_monthly: 7,
    extra_agent_price_usd: 7,
    price_usd_annual: 67,
    overage_per_min_usd: 0.2,
    envKeys: {
      monthly: "STRIPE_PERSONAL_PRICE_ID",
      annual: "STRIPE_PERSONAL_ANNUAL_PRICE_ID",
      extra: "STRIPE_PERSONAL_EXTRA_AGENT_PRICE_ID",
      overage: "STRIPE_PERSONAL_OVERAGE_PRICE_ID"
    }
  },
  {
    id: "personal-plus",
    name: "Office Assistant",
    price_usd_monthly: 15,
    extra_agent_price_usd: 7,
    price_usd_annual: 144,
    overage_per_min_usd: 0.18,
    envKeys: {
      monthly: "STRIPE_PERSONAL_PLUS_PRICE_ID",
      annual: "STRIPE_PERSONAL_PLUS_ANNUAL_PRICE_ID",
      extra: "STRIPE_PERSONAL_PLUS_EXTRA_AGENT_PRICE_ID",
      overage: "STRIPE_PERSONAL_PLUS_OVERAGE_PRICE_ID"
    }
  },
  {
    id: "business-starter",
    name: "Front Desk",
    price_usd_monthly: 29,
    extra_agent_price_usd: 9,
    price_usd_annual: 278,
    overage_per_min_usd: 0.16,
    envKeys: {
      monthly: "STRIPE_BUSINESS_STARTER_PRICE_ID",
      annual: "STRIPE_BUSINESS_STARTER_ANNUAL_PRICE_ID",
      extra: "STRIPE_BUSINESS_STARTER_EXTRA_AGENT_PRICE_ID",
      overage: "STRIPE_BUSINESS_STARTER_OVERAGE_PRICE_ID"
    }
  },
  {
    id: "starter",
    name: "Sales & Reception",
    price_usd_monthly: 59,
    extra_agent_price_usd: 12,
    price_usd_annual: 566,
    overage_per_min_usd: 0.14,
    envKeys: {
      monthly: "STRIPE_PRO_PRICE_ID",
      annual: "STRIPE_PRO_ANNUAL_PRICE_ID",
      extra: "STRIPE_PRO_EXTRA_AGENT_PRICE_ID",
      overage: "STRIPE_PRO_OVERAGE_PRICE_ID"
    }
  },
  {
    id: "scale",
    name: "Custom Enterprise",
    price_usd_monthly: 0,
    extra_agent_price_usd: 0,
    price_usd_annual: 0,
    overage_per_min_usd: 0,
    envKeys: {
      monthly: "STRIPE_BUSINESS_PRICE_ID",
      annual: "STRIPE_BUSINESS_ANNUAL_PRICE_ID",
      extra: "STRIPE_BUSINESS_EXTRA_AGENT_PRICE_ID",
      overage: "STRIPE_BUSINESS_OVERAGE_PRICE_ID"
    }
  }
];

async function run() {
  const envVars = {};

  for (const plan of catalog) {
    console.log(`Creating product: ${plan.name}...`);
    const product = await stripe.products.create({
      name: plan.name,
      metadata: { wireline_plan_id: plan.id }
    });

    if (plan.price_usd_monthly > 0) {
      console.log(`  - Creating monthly price for ${plan.name}`);
      const priceMonth = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.price_usd_monthly * 100,
        currency: "usd",
        recurring: { interval: "month" },
      });
      envVars[plan.envKeys.monthly] = priceMonth.id;
    }

    if (plan.price_usd_annual > 0) {
      console.log(`  - Creating annual price for ${plan.name}`);
      const priceAnnual = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.price_usd_annual * 100,
        currency: "usd",
        recurring: { interval: "year" },
      });
      envVars[plan.envKeys.annual] = priceAnnual.id;
    }

    if (plan.extra_agent_price_usd > 0) {
      console.log(`  - Creating extra agent price for ${plan.name}`);
      const priceExtra = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.extra_agent_price_usd * 100,
        currency: "usd",
        recurring: { interval: "month" },
      });
      envVars[plan.envKeys.extra] = priceExtra.id;
    }

    if (plan.overage_per_min_usd > 0) {
      console.log(`  - Creating overage price for ${plan.name}`);
      const priceOverage = await stripe.prices.create({
        product: product.id,
        unit_amount: Math.round(plan.overage_per_min_usd * 100),
        currency: "usd",
        recurring: { interval: "month", usage_type: "metered" },
      });
      envVars[plan.envKeys.overage] = priceOverage.id;
    }
  }

  // Generate vercel pull commands or a JSON
  console.log("\nGenerated Environment Variables:");
  fs.writeFileSync("stripe-env.json", JSON.stringify(envVars, null, 2));
  console.log(JSON.stringify(envVars, null, 2));
}

run().catch(console.error);
