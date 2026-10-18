import { useEffect } from "react";
import { PageMeta } from "../lib/page-meta";
import { HOME_DESCRIPTION, HOME_TITLE } from "../lib/marketing-route-meta";
import { BOTBOUND_PRODUCTION_ORIGIN } from "../lib/brand";
import { captureSignupIntentFromLocation } from "../lib/signup-intent";
import WireAgentLanding from "../components/marketing/WireAgentLanding";

const PUBLIC_ORIGIN = BOTBOUND_PRODUCTION_ORIGIN;

export default function LandingPage() {
  useEffect(() => {
    captureSignupIntentFromLocation();
  }, []);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${PUBLIC_ORIGIN}/#software`,
    name: "BotBound",
    description: HOME_DESCRIPTION,
    applicationCategory: "BusinessApplication",
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
