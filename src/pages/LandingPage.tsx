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
      "Create, train, wire, run, and review outbound call agents for sales prospecting, marketing re-engagement, billing collection, negotiation, surveys, scheduling, and follow-up.",
    offers: {
      "@type": "OfferCatalog",
      name: "Wireline outbound agent plans",
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
        title="Wireline | Outbound call agents"
        description="Wireline builds trained outbound call agents for sales, marketing re-engagement, billing collection, negotiation, surveys, scheduling, and follow-up."
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
