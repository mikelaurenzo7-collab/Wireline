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
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Web, iOS, Android",
    description:
      "Create, train, and run agents for calls, texts, follow-up, browser context, email, and integrations.",
  };

  return (
    <>
      <PageMeta
        title="Wireline | Agents for every conversation"
        description="Create, train, and run agents that handle calls, texts, follow-up, browser context, email, and integrations."
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
