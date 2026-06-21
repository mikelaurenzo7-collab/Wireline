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

  return (
    <>
      <PageMeta
        title="Wireline | AI Voice + Messaging"
        description="Wireline handles the calls, messages, follow-ups, and hold music that interrupt your life and work."
        image="/og-image.jpg"
      />
      <PrecisionLanding />
    </>
  );
}
