import { useState } from "react";
import { Check, ShieldCheck } from "lucide-react";

import { Button } from "../atoms";
import { WL_APP_CLASSES } from "../../lib/wireline-design-system";
import type { VideoPresenterConsentStatus } from "../../lib/video-presenter/types";

type CustomPresenceConsentPanelProps = {
  consentStatus: VideoPresenterConsentStatus;
  onSubmit: (status: VideoPresenterConsentStatus) => Promise<void>;
};

type Step = "rights" | "capture" | "review";

export default function CustomPresenceConsentPanel({
  consentStatus,
  onSubmit,
}: CustomPresenceConsentPanelProps) {
  const [step, setStep] = useState<Step>("rights");
  const [saving, setSaving] = useState(false);
  const [rightsAccepted, setRightsAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (consentStatus === "approved" || consentStatus === "pending") {
    return null;
  }

  async function submitPending() {
    setSaving(true);
    setError(null);
    try {
      await onSubmit("pending");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Consent could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="wl-banner wl-banner--info mt-4">
      <div className="wl-banner__icon" aria-hidden="true">
        <ShieldCheck size={18} />
      </div>
      <div className="wl-banner__body">
        <p className={WL_APP_CLASSES.wiredEyebrow}>Custom presence</p>
        <h3 className="wl-banner__title">Your presence on the line</h3>
        {error ? <p className="wl-banner__detail text-destructive">{error}</p> : null}
        {step === "rights" ? (
          <>
            <p className="wl-banner__detail">
              Custom presence uses your likeness for live presenter previews. You confirm you have
              rights to the footage and consent to Wireline processing it for this account.
            </p>
            <label className="mt-3 flex items-start gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={rightsAccepted}
                onChange={(event) => setRightsAccepted(event.target.checked)}
                className="mt-1 size-4 rounded border-border"
              />
              <span>I have rights to use this likeness for my Wireline agents.</span>
            </label>
            <div className="wl-banner__actions mt-3">
              <Button
                type="button"
                size="sm"
                disabled={!rightsAccepted}
                onClick={() => setStep("capture")}
              >
                Continue
              </Button>
            </div>
          </>
        ) : null}
        {step === "capture" ? (
          <>
            <p className="wl-banner__detail">
              Record a continuous 2-minute video: front-facing, steady lighting, neutral background,
              natural speech. We review before your custom presence goes live.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              <li>Look at the camera and speak in your normal tone.</li>
              <li>No filters, hats, or heavy shadows across your face.</li>
              <li>Use the same person who will approve the final presence.</li>
            </ul>
            <div className="wl-banner__actions mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setStep("rights")}>
                Back
              </Button>
              <Button type="button" size="sm" onClick={() => setStep("review")}>
                I have footage ready
              </Button>
            </div>
          </>
        ) : null}
        {step === "review" ? (
          <>
            <p className="wl-banner__detail">
              Submit for review. We will notify you when your custom presence is approved and ready
              in Studio.
            </p>
            <div className="wl-banner__actions mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setStep("capture")}
              >
                Back
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={saving}
                onClick={() => void submitPending()}
              >
                {saving ? "Submitting…" : "Submit for review"}
              </Button>
            </div>
          </>
        ) : null}
        {consentStatus === "rejected" ? (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
            <Check size={12} aria-hidden="true" />
            Previous submission needs a new capture — start again when ready.
          </p>
        ) : null}
      </div>
    </section>
  );
}
