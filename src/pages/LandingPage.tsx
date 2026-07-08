import { useEffect } from "react";
import { PageMeta } from "../lib/page-meta";
import { captureSignupIntentFromLocation } from "../lib/signup-intent";
import { captureDemoSourceFromLocation } from "../lib/demo-attribution-client";
import PrecisionLanding from "../components/marketing/PrecisionLanding";

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
    description:
      "Wireline builds trained voice agents that answer, route, book, follow up, and text the outcome for solo business agents, call centers, and sales teams. Start outbound-first, then choose inbound or hybrid modes.",
    offers: {
      "@type": "OfferCatalog",
      name: "Wireline call agent plans",
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
        title="Wireline | Wire your agent"
        description="Wireline builds trained voice agents that answer, route, book, follow up, and text the outcome for solo business agents, call centers, and sales teams. Start outbound-first, then choose inbound or hybrid modes."
        image="/og-image.png"
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PrecisionLanding />
    </>
  );
}
