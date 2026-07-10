import { useEffect } from "react";
import { PageMeta } from "../lib/page-meta";
import { captureSignupIntentFromLocation } from "../lib/signup-intent";
import { captureDemoSourceFromLocation } from "../lib/demo-attribution-client";
import WireAgentLanding from "../components/marketing/WireAgentLanding";

const PUBLIC_DESCRIPTION =
  "Wireline builds AI profit agents with included numbers that call, book appointments, revive leads, promote offers, recover opportunities, follow up, and report back with every result.";

export default function LandingPage() {
  useEffect(() => {
    captureSignupIntentFromLocation();
    captureDemoSourceFromLocation();
  }, []);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Wireline",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, iOS, Android, Chrome, Opera",
    description: PUBLIC_DESCRIPTION,
    offers: {
      "@type": "OfferCatalog",
      name: "Wireline AI profit agent plans",
      itemListElement: ["Personal", "Team", "Business", "Enterprise"].map((name) => ({
        "@type": "Offer",
        name,
        url: "https://trywireline.com/pricing",
      })),
    },
  };

  return (
    <>
      <PageMeta
        title="Wireline | AI profit agents that actually call"
        description={PUBLIC_DESCRIPTION}
        image="/og-image.png"
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <WireAgentLanding />
    </>
  );
}
