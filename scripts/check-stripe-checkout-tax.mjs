import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");
const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const subscriptionCheckout = read("src/routes/launch-billing-checkout-routes.ts");
const balanceCheckout = read("src/routes/conversation-balance-routes.ts");

for (const [name, source] of [
  ["subscription checkout", subscriptionCheckout],
  ["Conversation Balance checkout", balanceCheckout],
]) {
  assert(
    source.includes('customer_update: { address: "auto" }'),
    `${name} must collect or update the customer address for tax calculation.`,
  );
  assert(
    source.includes("automatic_tax: { enabled: true }"),
    `${name} must enable Stripe Automatic Tax on the Checkout Session.`,
  );
}

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
