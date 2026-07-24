import { Link } from "react-router-dom";
import { FileText, ArrowLeft } from "lucide-react";
import { PageMeta } from "../lib/page-meta";
import MarketingChrome from "./marketing/MarketingChrome";

const LAST_UPDATED = "July 19, 2026";

// ─────────────────────────────────────────────────────────────────────────────
// Shared layout wrapper for legal pages
// ─────────────────────────────────────────────────────────────────────────────
function LegalLayout({
  title,
  icon: Icon,
  children,
  summary,
}: {
  title: string;
  icon: typeof FileText;
  children: React.ReactNode;
  summary?: readonly string[];
}) {
  return (
    <MarketingChrome stickyCta={false}>
      <div className="max-w-3xl mx-auto px-5 sm:px-6 py-8 sm:py-12">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-caption font-medium text-muted hover:text-foreground transition-colors mb-8 -mx-2 px-2 py-2 rounded-md hover:bg-black/[0.03] min-h-[44px]"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back home
        </Link>

        <div className="mb-3 flex flex-col items-center gap-3 text-center">
          <div className="w-10 h-10 rounded-md flex items-center justify-center shrink-0 bg-brand">
            <Icon className="w-5 h-5 text-on-brand" />
          </div>
          <h1 className="marketing-hero-title text-2xl sm:text-3xl">{title}</h1>
        </div>
        <p className="mb-10 text-center text-eyebrow !text-[0.625rem]">
          Last updated: {LAST_UPDATED}
        </p>

        {summary?.length ? (
          <div className="mb-10 grid gap-3 sm:grid-cols-3" aria-label={`${title} summary`}>
            {summary.map((item) => (
              <div
                key={item}
                className="rounded-md border border-border bg-background/45 p-4 text-center"
              >
                <p className="text-sm leading-6 text-foreground">{item}</p>
              </div>
            ))}
          </div>
        ) : null}

        <div className="prose prose-sm sm:prose-base max-w-none space-y-8 text-foreground/85 leading-relaxed">
          {children}
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
          <Link
            to="/privacy#ccpa"
            className="hover:text-foreground transition-colors min-h-[44px] inline-flex items-center"
          >
            Do Not Sell My Information
          </Link>
        </div>
      </div>
    </MarketingChrome>
  );
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
      <h2 className="text-base font-semibold text-foreground mb-3 border-b border-white/8 pb-2">
        {title}
      </h2>
      <div className="space-y-3 text-sm">{children}</div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Terms of Service
// ─────────────────────────────────────────────────────────────────────────────
export function TermsOfService() {
  return (
    <LegalLayout
      title="Terms of Service"
      icon={FileText}
      summary={[
        "Customers own their agent configurations, knowledge, recordings, and data.",
        "Outbound calling compliance remains a shared operating responsibility.",
        "The first paid invoice carries a 30-day money-back guarantee.",
      ]}
    >
      <PageMeta
        title="Terms of Service"
        description="Wireline's terms of service — acceptable use, billing, telemarketing compliance (TCPA), SMS opt-out disclosure, limitation of liability, and governing law (Delaware). Last updated July 19, 2026."
        path="/terms"
      />

      <Section title="1. Acceptance">
        <p>
          By accessing or using Wireline you agree to these Terms of Service ("Terms"). If you do
          not agree, do not use the service. These Terms constitute a binding agreement between you
          and <strong>Wireline</strong>.
        </p>
      </Section>

      <Section title="2. Service Description">
        <p>
          Wireline provides AI-powered voice and email agent infrastructure for businesses. The
          service includes agent configuration tools, call routing, email triage, outbound dialing
          campaigns, a DNC manager, and analytics.
        </p>
      </Section>

      <Section title="3. Acceptable Use">
        <p>You agree not to use Wireline to:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Dial numbers on the National Do Not Call Registry without a valid exemption</li>
          <li>
            Send unsolicited commercial messages (spam) in violation of CAN-SPAM, CASL, or similar
            laws
          </li>
          <li>Impersonate any person or organisation</li>
          <li>
            Violate any telemarketing law including the TCPA (US), CASL (Canada), or applicable
            state law
          </li>
          <li>
            Process highly sensitive categories of personal data (health, financial) without
            appropriate safeguards
          </li>
          <li>
            Reverse-engineer, scrape, or abuse the platform's APIs beyond their intended purpose
          </li>
          <li>Use the platform for illegal purposes or to facilitate illegal activity</li>
        </ul>
      </Section>

      <Section title="4. Telemarketing Compliance">
        <p>
          You are solely responsible for ensuring all outbound calls and messages comply with
          applicable laws, including the Telephone Consumer Protection Act (TCPA), FTC regulations,
          and any state or local laws. Wireline provides DNC list management tools to assist
          compliance, but does not guarantee your legal compliance and accepts no liability for
          regulatory violations.
        </p>
      </Section>

      <Section title="5. SMS and Messaging Terms">
        <p>
          <strong>Consumer notice — reply STOP to opt out, HELP for help.</strong> Wireline numbers
          can send transactional and business communications by SMS. Recipients may reply
          <strong> STOP</strong>, <strong>UNSUBSCRIBE</strong>, <strong>CANCEL</strong>,{" "}
          <strong>QUIT</strong>, or <strong>END</strong> at any time to stop further messages from
          that number, and <strong>HELP</strong> to receive support contact information. Wireline
          honors these keywords automatically and records the opt-out on the underlying consent
          ledger.
        </p>
        <p>
          <strong>Message and data rates may apply. Message frequency varies</strong> by the
          business, the campaign, and the recipient's activity. Wireline does not charge recipients
          for messages, but the recipient's carrier may. Wireline is not responsible for carrier
          fees.
        </p>
        <p>
          <strong>A2P 10DLC registration (US carriers).</strong> Business (Application-to-Person)
          messaging in the United States requires brand and campaign registration with US carrier
          consortia. Wireline (as the Communications Service Provider) coordinates that registration
          with account holders who send business SMS; the registered brand and use case are the
          account holder's, not Wireline's. Unregistered or misrepresented traffic may be filtered,
          blocked, or rate-limited by carriers.
        </p>
        <p>
          Report messaging complaints or ask a question about SMS from a Wireline number by emailing{" "}
          <strong>support@trywireline.com</strong>.
        </p>
      </Section>

      <Section title="6. Billing and Subscriptions">
        <p>
          Paid features are billed monthly via Stripe. Subscriptions renew automatically unless
          cancelled before the renewal date. You may cancel at any time via the Billing section in
          Settings; cancellation takes effect at the end of the current billing period.
        </p>
        <p>
          <strong>30-day money-back guarantee.</strong> If Wireline isn't working for your business
          for any reason within 30 days of your first paid invoice, email{" "}
          <strong>support@trywireline.com</strong> with the subject "Refund request" and we'll
          refund that month's charge in full — no forms, no escalation, no questions about your
          reason. The 30-day window starts on the date of your first paid invoice. Outbound call
          minutes consumed prior to the refund request are not separately deducted — the refund is
          on the subscription line item.
        </p>
        <p>
          After the 30-day window, no refunds are issued for partial periods, but you can cancel
          renewal at any time (effective at the end of the current period) so future charges stop.
        </p>
        <p>
          We reserve the right to change pricing with 30 days' notice. Your continued use after the
          effective date constitutes acceptance of the new pricing.
        </p>
      </Section>

      <Section title="7. Data and Privacy">
        <p>
          Your use of Wireline is governed by our{" "}
          <Link to="/privacy" className="text-brand hover:text-brand/80 underline">
            Privacy Policy
          </Link>
          , which is incorporated into these Terms by reference.
        </p>
      </Section>

      <Section title="8. Intellectual Property">
        <p>
          You retain full ownership of your agent configurations, knowledge base content, call
          recordings, and all other data you create in Wireline. By using the platform you grant us
          a limited, non-exclusive license to process this data solely to provide the service.
        </p>
        <p>
          All platform code, design, trademarks, and other IP belonging to <strong>Wireline</strong>{" "}
          remain our exclusive property. You may not copy, modify, or distribute any part of the
          platform.
        </p>
      </Section>

      <Section title="9. Disclaimer of Warranties">
        <p>
          Wireline is provided "as is" and "as available" without warranty of any kind, express or
          implied, including warranties of merchantability, fitness for a particular purpose, or
          non-infringement. We do not warrant that the service will be uninterrupted, error-free, or
          free of viruses.
        </p>
      </Section>

      <Section title="10. Limitation of Liability">
        <p>
          To the maximum extent permitted by applicable law, <strong>Wireline</strong>'s total
          liability arising out of or related to these Terms or the service shall not exceed the
          amounts paid by you in the 12 months preceding the claim. We are not liable for any
          indirect, incidental, special, consequential, or punitive damages.
        </p>
      </Section>

      <Section title="11. Indemnification">
        <p>
          You agree to indemnify and hold harmless <strong>Wireline</strong> from any claims,
          damages, or expenses (including reasonable attorneys' fees) arising from your use of the
          service, violation of these Terms, or violation of any applicable law or third-party
          right.
        </p>
      </Section>

      <Section title="12. Governing Law">
        <p>
          These Terms are governed by the laws of <strong>Delaware, United States</strong>, without
          regard to conflict-of-law principles. Any disputes shall be resolved exclusively in the
          courts of <strong>Wilmington, Delaware</strong>.
        </p>
      </Section>

      <Section title="13. Modifications">
        <p>
          We may update these Terms with 14 days' advance notice posted on this page. Your continued
          use after the effective date constitutes acceptance of the revised Terms.
        </p>
      </Section>

      <Section title="14. Contact">
        <p>
          Legal notices: <strong>support@trywireline.com</strong>
        </p>
      </Section>
    </LegalLayout>
  );
}
