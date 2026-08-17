import { useState } from "react";
import { ArrowLeft, Cookie, Shield } from "lucide-react";
import { Link } from "react-router";
import { PageMeta } from "../lib/page-meta";
import MarketingChrome from "./marketing/MarketingChrome";
import { ShadButton } from "./ui/shadcn/ShadButton";

const LAST_UPDATED = "August 1, 2026";
const NOTICE_STORAGE_KEY = "wireline_cookie_consent";
const MEASUREMENT_STORAGE_KEY = "wireline_marketing_measurement_consent";
const MEASUREMENT_CONSENT_EVENT = "wireline:marketing-measurement-consent";
const CCPA_SHARING_DISCLOSURE = `We do not sell personal information for money. California law may treat disclosure of limited website event and device data to an advertising platform for cross-context campaign measurement as "sharing," even when no money changes hands. Meta measurement remains off unless you affirmatively allow it.`;

type MeasurementConsent = "granted" | "denied";

type PrivacyAwareNavigator = Navigator & {
  globalPrivacyControl?: boolean;
};

function globalPrivacyControlEnabled(): boolean {
  if (typeof navigator === "undefined") return false;
  return (navigator as PrivacyAwareNavigator).globalPrivacyControl === true;
}

function readMeasurementConsent(): MeasurementConsent {
  if (typeof window === "undefined") return "denied";
  try {
    return localStorage.getItem(MEASUREMENT_STORAGE_KEY) === "granted" ? "granted" : "denied";
  } catch {
    return "denied";
  }
}

function Section({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id}>
      <h2 className="text-base font-semibold uppercase tracking-[0.04em] text-foreground mb-3 border-b border-white/8 pb-2">
        {title}
      </h2>
      <div className="space-y-3 text-sm">{children}</div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  const privacySignalEnabled = globalPrivacyControlEnabled();
  const [measurementConsent, setMeasurementConsent] = useState<MeasurementConsent>(() =>
    privacySignalEnabled ? "denied" : readMeasurementConsent(),
  );

  const saveMeasurementConsent = (requested: MeasurementConsent) => {
    const choice = privacySignalEnabled ? "denied" : requested;
    try {
      localStorage.setItem(NOTICE_STORAGE_KEY, "acknowledged");
      localStorage.setItem(MEASUREMENT_STORAGE_KEY, choice);
    } catch {
      // The measurement runtime defaults to off when browser storage is unavailable.
    }
    window.dispatchEvent(
      new CustomEvent(MEASUREMENT_CONSENT_EVENT, {
        detail: choice,
      }),
    );
    setMeasurementConsent(choice);
  };

  return (
    <MarketingChrome stickyCta={false}>
      <PageMeta
        title="Privacy Policy"
        description="Privacy for Wireline's voice agent platform: account, conversation, authorized voice, billing, and measurement data. Last updated August 1, 2026."
        path="/privacy"
      />

      <div className="max-w-3xl mx-auto px-5 sm:px-6 py-8 sm:py-12">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-caption font-medium text-muted hover:text-foreground transition-colors mb-8 -mx-2 px-2 py-2 rounded-md hover:bg-black/[0.03] min-h-[44px]"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back home
        </Link>

        <div className="mb-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-md flex items-center justify-center shrink-0 bg-brand">
            <Shield className="w-5 h-5 text-on-brand" />
          </div>
          <h1 className="marketing-hero-title text-2xl sm:text-3xl">Privacy Policy</h1>
        </div>
        <p className="mb-10 text-eyebrow !mx-0 !text-[0.625rem]">Last updated: {LAST_UPDATED}</p>

        <div className="mb-10 grid gap-3 sm:grid-cols-3" aria-label="Privacy Policy summary">
          {[
            "We do not sell personal information.",
            "Optional advertising measurement stays off unless you allow it.",
            "Custom voices stay private and require speaker authorization.",
          ].map((item) => (
            <div
              key={item}
              className="flex items-center justify-center rounded-md border border-border bg-background/45 p-4 text-center"
            >
              <p className="text-sm leading-6 text-foreground">{item}</p>
            </div>
          ))}
        </div>

        <div
          className="mb-10 rounded-md border border-brand/20 bg-brand/5 p-5"
          id="privacy-choices"
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand/10">
              <Cookie className="h-4 w-4 text-brand" />
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  Advertising measurement choice
                </h2>
                <p className="mt-1 text-sm leading-6 text-foreground/75">
                  Plausible product analytics remains separate and does not use advertising cookies.
                  Meta advertising measurement loads only when you choose{" "}
                  <strong>Allow measurement</strong>.
                </p>
              </div>

              {privacySignalEnabled ? (
                <p className="text-sm leading-6 text-muted-foreground" aria-live="polite">
                  Global Privacy Control is active in your browser. Advertising measurement is off
                  and cannot be enabled while that signal remains active.
                </p>
              ) : (
                <p className="text-sm leading-6 text-muted-foreground" aria-live="polite">
                  Current choice:{" "}
                  <strong>{measurementConsent === "granted" ? "Allowed" : "Off"}</strong>
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <ShadButton
                  type="button"
                  variant="outline"
                  size="sm"
                  disableAnimations
                  onClick={() => saveMeasurementConsent("denied")}
                >
                  Keep measurement off
                </ShadButton>
                <ShadButton
                  type="button"
                  size="sm"
                  disableAnimations
                  disabled={privacySignalEnabled}
                  onClick={() => saveMeasurementConsent("granted")}
                >
                  Allow measurement
                </ShadButton>
              </div>
            </div>
          </div>
        </div>

        <div className="prose prose-sm sm:prose-base max-w-none space-y-8 text-foreground/85 leading-relaxed">
          <Section title="1. Who We Are">
            <p>
              <strong>Wireline</strong> ("we", "our", or "us") operates a voice agent platform for
              business conversations across voice, SMS, and email. Questions about this policy can
              be sent to <strong>support@trywireline.com</strong>.
            </p>
          </Section>

          <Section title="2. Data We Collect">
            <p>
              <strong>Account data</strong>: Email address, password hashes, authentication tokens,
              and account preferences provided during sign-up and use of the platform.
            </p>
            <p>
              <strong>Agent configuration</strong>: Names, personas, directives, knowledge entries,
              connected tools, and voice settings you create for your voice agents.
            </p>
            <p>
              <strong>Conversation data</strong>: Phone numbers, message addresses, recordings,
              transcripts, summaries, message content, and operational metadata needed to provide
              the calling, texting, and email service you configure.
            </p>
            <p>
              <strong>Authorized voice data</strong>: When the account owner creates a custom voice,
              we process the submitted recording, voice characteristics, a one-way sample
              fingerprint, voice-model identifier, consent record, review audio, approval status,
              and lifecycle audit events. Voice characteristics may be biometric or sensitive data
              under applicable law.
            </p>
            <p>
              <strong>Usage and billing data</strong>: Feature usage, AI-model consumption, plan and
              balance records, and Stripe billing information. We do not store full payment-card
              numbers.
            </p>
            <p>
              <strong>Log and diagnostic data</strong>: Server logs, security events, error reports,
              and performance metrics used to secure, operate, and improve the service.
            </p>
            <p>
              <strong>Website measurement data</strong>: Plausible provides aggregate product
              analytics such as page, referrer, browser, device, and approximate country information
              without advertising cookies. If you explicitly allow advertising measurement, Meta may
              also receive limited browser/device identifiers, IP address, page and referrer URLs,
              and conversion events for campaign attribution. We do not send agent content, call
              recordings, transcripts, customer contact lists, email or SMS bodies, or payment-card
              data to Meta Pixel.
            </p>
          </Section>

          <Section title="3. How We Use Data">
            <p>
              We use data to provide and secure Wireline; process managed AI requests primarily
              through OpenAI, with Google Gemini and Vercel AI Gateway as continuity routes (and xAI
              only when explicitly enabled); synthesize authorized voice output through ElevenLabs;
              route calls and messages; execute connected workflows; provide support; prevent fraud
              and abuse; bill through Stripe; and understand aggregate product performance.
            </p>
            <p>
              Optional Meta measurement is used only after your explicit choice to attribute
              marketing campaigns and measure website conversions. It is not required to create an
              account or use Wireline, and you can turn it off at any time using the controls on
              this page.
            </p>
            <p>
              Wireline does not train its own models on customer agent configurations, recordings,
              transcripts, message content, or custom voice samples. AI and voice providers process
              submitted data under their applicable contracts, privacy terms, account controls, and
              safety obligations.
            </p>
          </Section>

          <Section title="4. Third-Party Sub-Processors and Measurement Providers">
            <p>We rely on the following providers for defined service functions:</p>
            <ul className="list-disc list-inside space-y-1.5 ml-2">
              <li>
                <strong>Supabase</strong>: Managed Postgres storage and backup
              </li>
              <li>
                <strong>Vapi, Twilio, and Deepgram</strong>: Calls, phone numbers, SMS, and
                transcription
              </li>
              <li>
                <strong>ElevenLabs</strong>: Managed text-to-speech, authorized private voice-model
                creation, quality proofs, and voice-model deletion
              </li>
              <li>
                <strong>xAI</strong>: Primary managed AI inference (Grok 4.6) and live phone
                conversation models (Grok 4.3 plus xAI voices through Vapi)
              </li>
              <li>
                <strong>OpenAI</strong>: Continuity inference and realtime voice sessions
              </li>
              <li>
                <strong>Google Gemini</strong>: Managed continuity inference and grounded search
              </li>
              <li>
                <strong>Perplexity</strong>: Optional live public research
              </li>
              <li>
                <strong>Vercel AI Gateway</strong>: Governed multi-model continuity, budgets, and
                inference observability
              </li>
              <li>
                <strong>Stripe</strong>: Payment processing, billing, and tax calculation
              </li>
              <li>
                <strong>Resend</strong>: Transactional email delivery
              </li>
              <li>
                <strong>Vercel</strong>: Hosting, functions, and edge delivery
              </li>
              <li>
                <strong>Upstash</strong>: Distributed rate limits and spend controls
              </li>
              <li>
                <strong>HeyGen and LiveAvatar</strong>: Optional presenter video and voice features
              </li>
              <li>
                <strong>Plausible</strong>: Privacy-oriented aggregate website analytics
              </li>
              <li>
                <strong>Meta</strong>: Optional advertising measurement and campaign attribution,
                only after explicit consent and subject to Global Privacy Control
              </li>
              <li>
                <strong>Have I Been Pwned Pwned Passwords</strong>:{" "}
                {"Compromised-password screening using a k-anonymous partial hash prefix"}
              </li>
              <li>
                <strong>Services you connect</strong>: Such as Google, Microsoft, CRM, commerce,
                calendar, or team tools, only when you authorize them
              </li>
            </ul>
            <p>
              Optional providers receive data only when you enable the related feature or direct an
              agent to use it.
            </p>
            <p>
              Mobile contact information and SMS opt-in records are not sold or shared with third
              parties for their marketing.
            </p>
          </Section>

          <Section title="5. Data Retention and Security">
            <p>
              Operational records are retained while your account is active and as needed to provide
              the service, resolve disputes, prevent abuse, and meet legal obligations. Account
              deletion starts a documented deletion process; associated personal data is erased
              within 30 days except for records we must retain by law or security records that have
              been de-identified.
            </p>
            <p>
              Wireline processes a custom-voice upload in memory and does not place the source file
              in its database or object storage. We retain the one-way fingerprint, authorization,
              ownership, review, and audit records needed to prevent duplicate or unauthorized use.
              ElevenLabs receives the sample to create and operate the voice model and retains or
              deletes provider-side data under its terms, privacy controls, and legal obligations.
              Revoking a voice immediately blocks new Wireline calls and requests provider deletion;
              if that request fails, deletion remains pending for an authorized retry.
            </p>
            <p>
              We use access controls, encryption in transit, restricted secrets, tenant isolation,
              audit logging, and database row-level security. No system is perfectly secure, but we
              continuously review and improve these safeguards.
            </p>
          </Section>

          <Section title="6. International Privacy Rights">
            <p>
              Depending on where you live, you may have rights to access, correct, delete, restrict
              or object to processing, withdraw consent, and receive a portable copy of personal
              data. To exercise a right, use Delete Account in Settings or contact
              <strong> support@trywireline.com</strong>. Where processing relies on consent,
              withdrawing consent does not affect processing completed before withdrawal.
            </p>
          </Section>

          <Section id="ccpa" title="7. California Privacy Rights (CCPA / CPRA)">
            <p>{CCPA_SHARING_DISCLOSURE}</p>
            <p>
              Select <strong>Keep measurement off</strong>, close the privacy notice, or enable
              Global Privacy Control to opt out. You may return to the controls above at any time.
              We will not discriminate against you for exercising a privacy right.
            </p>
            <p>
              California residents may also request access, correction, deletion, or information
              about categories of data collected and disclosed by contacting
              <strong> support@trywireline.com</strong>. We respond to verified requests within the
              period required by applicable law.
            </p>
          </Section>

          <Section title="8. Cookies, Local Storage, and Analytics">
            <p>
              Wireline uses first-party session cookies and local storage necessary for
              authentication, security, preferences, and remembering your privacy choice. Plausible
              aggregate analytics is separate from advertising measurement and does not use
              advertising cookies.
            </p>
            <p>
              Meta Pixel is optional and remains off until you choose{" "}
              <strong>Allow measurement</strong>. Global Privacy Control overrides an allow choice.
              Turning measurement off replaces Wireline's browser-side measurement function with a
              no-op so future Wireline-triggered Meta events stop;{" "}
              {"a request already in flight before revocation may still complete"}.
            </p>
          </Section>

          <Section title="9. Children's Privacy">
            <p>
              Wireline is not directed to children under 13, and we do not knowingly collect
              personal information from children. Contact us if you believe a child supplied
              information so we can investigate and delete it.
            </p>
          </Section>

          <Section title="10. Healthcare Data (HIPAA)">
            <p>
              <strong>Wireline is not HIPAA-certified at this time.</strong> Do not use Wireline to
              process or transmit Protected Health Information unless and until a written Business
              Associate Agreement and an explicitly supported HIPAA configuration are in place.
            </p>
          </Section>

          <Section title="11. Changes to This Policy">
            <p>
              We will post material changes on this page with a revised date and provide additional
              notice where required. Material changes to consent-based measurement will not convert
              an existing off choice into an allow choice.
            </p>
          </Section>

          <Section title="12. Contact">
            <p>
              Privacy questions or requests: <strong>support@trywireline.com</strong>
            </p>
          </Section>
        </div>

        <div className="mt-16 pt-8 border-t border-white/8 flex flex-wrap gap-x-4 gap-y-2 text-caption">
          <Link
            to="/privacy"
            className="hover:text-foreground transition-colors min-h-[44px] inline-flex items-center"
          >
            Privacy Policy
          </Link>
          <span aria-hidden="true">·</span>
          <Link
            to="/terms"
            className="hover:text-foreground transition-colors min-h-[44px] inline-flex items-center"
          >
            Terms of Service
          </Link>
          <span aria-hidden="true">·</span>
          <a
            href="#privacy-choices"
            className="hover:text-foreground transition-colors min-h-[44px] inline-flex items-center"
          >
            Privacy Choices
          </a>
        </div>
      </div>
    </MarketingChrome>
  );
}
