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
      "Build trained voice agents for personal assistants, solo business agents, call centers, sales teams, scheduling, routing, follow-up, and business phone coverage.",
  };

  return (
    <>
      <PageMeta
        title="Wireline | Wire your agent"
        description="From personal assistants to solo business agents, call centers, and sales teams, build a trained voice agent that answers, routes, books, follows up, and texts the outcome."
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
