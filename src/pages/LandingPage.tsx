import { useEffect } from "react";
import { PageMeta } from "../lib/page-meta";
import { MARKETING_VOICE } from "../lib/product-copy";
import { STRIPE_PLANS } from "../lib/plan-catalog";
import { captureSignupIntentFromLocation } from "../lib/signup-intent";
import { captureDemoSourceFromLocation } from "../lib/demo-attribution-client";
import WireAgentLanding from "../components/marketing/WireAgentLanding";

const PUBLIC_DESCRIPTION = MARKETING_VOICE.subline;

export default function LandingPage() {
  useEffect(() => {
    captureSignupIntentFromLocation();
    captureDemoSourceFromLocation();
  }, []);

  // Reuse the canonical SoftwareApplication @id declared in index.html's
  // JSON-LD @graph so crawlers merge this into that single entity instead of
  // seeing two conflicting SoftwareApplication nodes. This runtime node only
  // contributes the plan OfferCatalog the static graph does not carry.
  const publicPlans = STRIPE_PLANS.filter((plan) => plan.public !== false);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": "https://trywireline.com/#software",
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "USD",
      lowPrice: Math.min(...publicPlans.map((plan) => plan.price_usd_monthly)),
      highPrice: Math.max(...publicPlans.map((plan) => plan.price_usd_monthly)),
      offerCount: publicPlans.length,
      offers: publicPlans.map((plan) => ({
        "@type": "Offer",
        name: plan.name,
        price: plan.price_usd_monthly,
        priceCurrency: "USD",
        url: "https://trywireline.com/pricing",
      })),
    },
  };

  return (
    <>
      <PageMeta
        title="Wireline | Voice agents that get the work done"
        description={PUBLIC_DESCRIPTION}
        path="/"
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <WireAgentLanding />
    </>
  );
}
