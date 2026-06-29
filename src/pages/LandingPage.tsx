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
      "Create, train, and run voice agents for personal calls, business front desks, texts, follow-up, browser context, email, and integrations.",
  };

  return (
    <>
      <PageMeta
        title="Wireline | Voice agents for every line"
        description="AI voice agents for personal calls and business front desks. Answer calls, book appointments, take messages, follow up, and run connected workflows from one clean workspace."
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
