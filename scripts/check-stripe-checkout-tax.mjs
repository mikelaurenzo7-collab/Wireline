import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");
const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const subscriptionCheckout = read("src/routes/launch-billing-checkout-routes.ts");
const atomicSubscriptionCheckout = read("src/routes/launch-billing-checkout-atomic-routes.ts");
const balanceCheckout = read("src/routes/conversation-balance-routes.ts");
const liveVideoCheckout = read("src/routes/billing-routes.ts");
const stripeHelpers = read("src/lib/stripe-helpers.ts");
const envExample = read(".env.example");

for (const [name, source] of [
  ["subscription checkout", subscriptionCheckout],
  ["atomic subscription checkout", atomicSubscriptionCheckout],
  ["Conversation Balance checkout", balanceCheckout],
  ["Live Video checkout", liveVideoCheckout],
]) {
  assert(
    source.includes('customer_update: { address: "auto"'),
    `${name} must collect or update the customer address for tax calculation.`,
  );
  assert(
    source.includes("...stripeCheckoutTaxConfig()"),
    `${name} must use the registration-gated Automatic Tax helper.`,
  );
  assert(
    !source.includes("automatic_tax: { enabled: true }"),
    `${name} must not enable Automatic Tax unconditionally.`,
  );
}

assert(
  stripeHelpers.includes('process.env.STRIPE_AUTOMATIC_TAX_ENABLED === "true"'),
  "Automatic Tax must require an explicit affirmative production setting.",
);
assert(
  stripeHelpers.includes("automatic_tax: { enabled: true }"),
  "the shared helper must produce Stripe's Automatic Tax Checkout parameter when enabled.",
);
assert(
  envExample.includes("STRIPE_AUTOMATIC_TAX_ENABLED=false") &&
    envExample.includes("tax registration is active"),
  "the environment template must default tax collection off and name the registration prerequisite.",
);

assert(
  subscriptionCheckout.includes('mode: "subscription"'),
  "canonical plan checkout must remain a subscription Checkout Session.",
);
assert(
  balanceCheckout.includes('purpose: "credit_topup"'),
  "Conversation Balance checkout must retain its prepaid-credit metadata contract.",
);

if (failures.length > 0) {
  console.error("Stripe checkout tax contract failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Stripe checkout tax contract passed.");
