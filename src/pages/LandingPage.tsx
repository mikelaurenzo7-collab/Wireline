import { useEffect } from "react";
import { PageMeta } from "../lib/page-meta";
import { HOME_DESCRIPTION, HOME_TITLE } from "../lib/marketing-route-meta";
import { BOTBOUND_PRODUCTION_ORIGIN } from "../lib/brand";
import { PUBLIC_USAGE_TIERS, USAGE_TIERS } from "../lib/usage-billing-catalog";
import { captureSignupIntentFromLocation } from "../lib/signup-intent";
import WireAgentLanding from "../components/marketing/WireAgentLanding";

const PUBLIC_ORIGIN = BOTBOUND_PRODUCTION_ORIGIN;

export default function LandingPage() {
  useEffect(() => {
    captureSignupIntentFromLocation();
  }, []);
  const publicPlans = PUBLIC_USAGE_TIERS.map((id) => USAGE_TIERS[id]);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${PUBLIC_ORIGIN}/#software`,
    name: "BotBound",
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "USD",
      lowPrice: Math.min(...publicPlans.map((plan) => plan.monthlyUsd)),
      highPrice: Math.max(...publicPlans.map((plan) => plan.monthlyUsd)),
      offerCount: publicPlans.length,
      offers: publicPlans.map((plan) => ({
        "@type": "Offer",
        name: plan.name,
        price: plan.monthlyUsd,
        priceCurrency: "USD",
        url: `${PUBLIC_ORIGIN}/pricing`,
      })),
    },
  };

  return (
    <>
      <PageMeta title={HOME_TITLE} description={HOME_DESCRIPTION} path="/" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <WireAgentLanding />
    </>
  );
}
