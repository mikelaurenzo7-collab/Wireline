import { writeFileSync } from "node:fs";

const proposal = {
  generated_at: new Date().toISOString(),
  note: "Proposal only. Review, then create these products and prices in Stripe before repointing environment variables.",
  products: [
    {
      name: "Wireline Personal",
      kind: "personal_top_up_led",
      metadata: { wireline_plan_id: "personal", wireline_catalog_state: "proposal" },
    },
    {
      name: "Wireline Team",
      kind: "subscription",
      metadata: { wireline_plan_id: "business-starter", wireline_catalog_state: "proposal" },
    },
    {
      name: "Wireline Business",
      kind: "subscription",
      metadata: { wireline_plan_id: "starter", wireline_catalog_state: "proposal" },
    },
    {
      name: "Wireline Enterprise",
      kind: "subscription",
      metadata: { wireline_plan_id: "scale", wireline_catalog_state: "proposal" },
    },
    {
      name: "Conversation Balance",
      kind: "one_time_top_up",
      metadata: { wireline_price_type: "conversation_balance", wireline_catalog_state: "proposal" },
    },
  ],
};

writeFileSync("stripe-catalog-proposal.json", `${JSON.stringify(proposal, null, 2)}\n`);
console.log("Wrote stripe-catalog-proposal.json");
