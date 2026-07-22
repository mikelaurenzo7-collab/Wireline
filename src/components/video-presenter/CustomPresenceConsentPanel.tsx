import { ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "../atoms";
import { WL_APP_CLASSES } from "../../lib/wireline-design-system";
import type { VideoPresenterConsentStatus } from "../../lib/video-presenter/types";

type CustomPresenceConsentPanelProps = {
  consentStatus: VideoPresenterConsentStatus;
  /** Kept for call-site compatibility; upload/review is not wired yet. */
  onSubmit: (status: VideoPresenterConsentStatus) => Promise<void>;
};

/**
 * Custom presence upload is not wired yet (no footage artifact route). Keep the
 * panel honest: collect interest / rights awareness without pretending submit
 * queues a review.
 */
export default function CustomPresenceConsentPanel({
  consentStatus,
}: CustomPresenceConsentPanelProps) {
  if (consentStatus === "approved" || consentStatus === "pending") {
    return null;
  }

  return (
    <section className="wl-banner wl-banner--info mt-4">
      <div className="wl-banner__icon" aria-hidden="true">
        <ShieldCheck size={18} />
      </div>
      <div className="wl-banner__body">
        <p className={WL_APP_CLASSES.wiredEyebrow}>Custom presence</p>
        <h3 className="wl-banner__title">Your presence on the line</h3>
        <p className="wl-banner__detail">
          Custom likeness review is coming soon. When it launches, you will upload a short
          front-facing clip and confirm rights before any live presenter uses your face.
        </p>
        <p className="wl-banner__detail mt-2">
          Until then, keep Wireline faces for Studio identity — or contact us if you need an early
          custom-presence pilot.
        </p>
        <div className="wl-banner__actions mt-3">
          <Button asChild type="button" size="sm" variant="secondary">
            <Link to="/support">Talk to Wireline</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
