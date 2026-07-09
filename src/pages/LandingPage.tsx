import { useEffect } from "react";
import { PageMeta } from "../lib/page-meta";
import { captureSignupIntentFromLocation } from "../lib/signup-intent";
import { captureDemoSourceFromLocation } from "../lib/demo-attribution-client";
import WireAgentLanding from "../components/marketing/WireAgentLanding";

const PUBLIC_DESCRIPTION =
  "Wireline builds AI phone employees that answer calls, qualify leads, book appointments, follow up, collect, route, and report back with every result.";

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
      name: "Wireline AI phone employee plans",
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
        title="Wireline | AI phone employees that turn calls into sales"
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
