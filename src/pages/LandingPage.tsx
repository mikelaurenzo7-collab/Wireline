import { useEffect } from "react";
import { PageMeta } from "../lib/page-meta";
import { MARKETING_VOICE } from "../lib/product-copy";
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
  // contributes the plan OfferCatalog the static graph doesn't carry.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": "https://trywireline.com/#software",
    offers: {
      "@type": "OfferCatalog",
      name: "Wireline AI voice agent plans",
      itemListElement: ["Free Builder", "Starter", "Starter Plus", "Pro", "Business"].map(
        (name) => ({
          "@type": "Offer",
          name,
          url: "https://trywireline.com/pricing",
        }),
      ),
    },
  };

  return (
    <>
      <PageMeta
        title="Wireline — AI Voice Agents for Personal & Business"
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
