import { useEffect } from "react";
import { PageMeta } from "../lib/page-meta";
import { captureSignupIntentFromLocation } from "../lib/signup-intent";
import { captureDemoSourceFromLocation } from "../lib/demo-attribution-client";
import WireAgentLanding from "../components/marketing/WireAgentLanding";

const PUBLIC_DESCRIPTION =
  "Voice AI employee for real conversations. Wireline handles calls, follow-up, booking, and logged outcomes with an included number.";

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
      name: "Wireline AI employee plans",
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
        title="Wireline | Wire → Work → Win"
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
