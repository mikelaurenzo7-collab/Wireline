import { useEffect } from "react";
import { PageMeta } from "../lib/page-meta";
import { HOME_DESCRIPTION, HOME_TITLE } from "../lib/marketing-route-meta";
import { BOTBOUND_PRODUCTION_ORIGIN } from "../lib/brand";
import { STRIPE_PLANS } from "../lib/plan-catalog";
import { captureSignupIntentFromLocation } from "../lib/signup-intent";
import WireAgentLanding from "../components/marketing/WireAgentLanding";

const PUBLIC_ORIGIN = BOTBOUND_PRODUCTION_ORIGIN;

export default function LandingPage() {
  useEffect(() => {
    captureSignupIntentFromLocation();
  }, []);
  const publicPlans = STRIPE_PLANS.filter(
    (plan) => plan.public !== false && plan.checkoutAvailability === "available",
  );
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${PUBLIC_ORIGIN}/#software`,
    name: "BotBound",
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
