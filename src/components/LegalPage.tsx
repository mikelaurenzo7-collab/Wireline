import { Link } from "react-router-dom";
import { Shield, FileText, Trash2, ArrowLeft, Video } from "lucide-react";
import { PageMeta } from "../lib/page-meta";
import MarketingChrome from "./marketing/MarketingChrome";

const LAST_UPDATED = "July 6, 2026";

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
  icon: typeof Shield;
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

        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-md flex items-center justify-center shrink-0 bg-brand">
            <Icon className="w-5 h-5 text-on-brand" />
          </div>
          <h1 className="marketing-hero-title text-2xl sm:text-3xl">{title}</h1>
        </div>
        <p className="text-eyebrow !text-[0.625rem] mb-10">Last updated: {LAST_UPDATED}</p>

        {summary?.length ? (
          <div className="mb-10 grid gap-3 sm:grid-cols-3" aria-label={`${title} summary`}>
            {summary.map((item) => (
              <div key={item} className="rounded-md border border-border bg-background/45 p-4">
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
// Privacy Policy
// ─────────────────────────────────────────────────────────────────────────────
export function PrivacyPolicy() {
  return (
    <LegalLayout
      title="Privacy Policy"
      icon={Shield}
      summary={[
        "We do not sell or share personal information for advertising.",
        "Agent configurations and call transcripts are not used to train third-party AI models.",
        "Account deletion and privacy requests have a documented path.",
      ]}
    >
      <PageMeta
        title="Privacy Policy"
        description="Wireline's privacy policy — how we collect, use, and protect your data. Sub-processors include Postgres hosting, OpenAI, Google Gemini, Stripe, Vercel, and breached-password screening. Last updated July 6, 2026."
        path="/privacy"
      />

      <Section title="1. Who We Are">
        <p>
          <strong>Wireline</strong> ("we", "our", or "us") operates the Wireline platform — an
          AI-powered omnichannel agent Assistants for businesses. Questions about this policy can be
          sent to <strong>support@trywireline.com</strong>. This policy explains what data we
          collect, why, and your rights over it.
        </p>
      </Section>

      <Section title="2. Data We Collect">
        <p>
          <strong>Account data</strong> — Email address, password hashes, authentication tokens, and
          account preferences provided during sign-up and use of the platform.
        </p>
        <p>
          <strong>Agent configuration</strong> — Names, personas, directives, knowledge base
          entries, and voice settings you create for your AI agents.
        </p>
        <p>
          <strong>Call data</strong> — Phone numbers, call recordings, transcripts, summaries, and
          metadata for calls handled by your agents. Voice calls are routed through Wireline's voice
          infrastructure; transcripts are stored in our database.
        </p>
        <p>
          <strong>Email data</strong> — If you connect a Gmail or Microsoft account, we access email
          threads and messages you explicitly assign to agents for triage and drafting.
        </p>
        <p>
          <strong>Usage and billing data</strong> — Feature usage, AI model token consumption, and
          Stripe billing information. We do not store full payment card numbers.
        </p>
        <p>
          <strong>Log and diagnostic data</strong> — Server logs, error reports, and performance
          metrics used to operate and improve the service.
        </p>
      </Section>

      <Section title="3. How We Use Your Data">
        <p>
          We use collected data to: provide and operate the Wireline platform; process AI requests
          via OpenAI's API with Google Gemini as a managed fallback; route and log voice calls via
          our voice network; send scheduled email briefs via your linked Gmail/Outlook account;
          screen new and reset passwords against known-compromised password data using a partial
          hash prefix; and bill you via Stripe.
        </p>
        <p>
          We do <strong>not</strong> sell or share your personal information with third parties for
          advertising or cross-context behavioral advertising. We do not use your agent
          configurations or call transcripts to train AI models — ours or any third party's.
        </p>
      </Section>

      <Section title="4. Third-Party Sub-Processors">
        <p>We rely on the following sub-processors to deliver the service:</p>
        <ul className="list-disc list-inside space-y-1.5 ml-2">
          <li>
            <strong>Postgres hosting</strong> — Database storage and backup infrastructure
          </li>
          <li>
            <strong>Voice AI Infrastructure</strong> — Real-time voice processing and call routing
          </li>
          <li>
            <strong>OpenAI</strong> (openai.com) — AI model inference
          </li>
          <li>
            <strong>Google Gemini</strong> (google.com) — AI model fallback inference
          </li>
          <li>
            <strong>Stripe</strong> (stripe.com) — Payment processing and billing
          </li>
          <li>
            <strong>Vercel</strong> (vercel.com) — Platform hosting and edge delivery
          </li>
          <li>
            <strong>Have I Been Pwned Pwned Passwords</strong> (haveibeenpwned.com) — Breached
            password screening using a k-anonymous partial password-hash prefix
          </li>
        </ul>
      </Section>

      <Section title="5. Data Retention">
        <p>
          Call logs and transcripts are retained for as long as your account is active. You may
          delete individual call records at any time from Phone / Call History. Upon account
          deletion, all associated personal data is permanently erased within 30 days.
        </p>
      </Section>

      <Section title="6. Your Rights (EEA / UK / Canada)">
        <p>
          If you are located in the European Economic Area, United Kingdom, or Canada, you have the
          right to: access a copy of your personal data; correct inaccurate data; request erasure;
          object to or restrict processing; and receive your data in a portable format. To exercise
          these rights, use the <strong>Delete Account</strong> option in Settings, or contact us at
          the address below.
        </p>
        <p>
          Where we rely on legitimate interests as the legal basis for processing, you have the
          right to object. Our lawful basis for processing account and usage data is the performance
          of a contract (providing the service you subscribed to).
        </p>
      </Section>

      <Section id="ccpa" title="7. California Privacy Rights (CCPA / CPRA)">
        <p>
          If you are a California resident, you have the following rights under the California
          Consumer Privacy Act (CCPA) and California Privacy Rights Act (CPRA):
        </p>
        <ul className="list-disc list-inside space-y-1.5 ml-2">
          <li>
            <strong>Right to know</strong> — what personal information we collect, use, and disclose
          </li>
          <li>
            <strong>Right to delete</strong> — request deletion of your personal information
          </li>
          <li>
            <strong>Right to correct</strong> — request correction of inaccurate personal
            information
          </li>
          <li>
            <strong>Right to opt-out</strong> — opt out of the sale or sharing of personal
            information
          </li>
          <li>
            <strong>Right to limit use</strong> — limit use of sensitive personal information
          </li>
          <li>
            <strong>Right to non-discrimination</strong> — we will not discriminate for exercising
            these rights
          </li>
        </ul>
        <p className="mt-3 p-3 rounded-md border border-brand/20 bg-brand/5 text-brand/90 text-[var(--wireline-typography-caption-size)]">
          <strong>We do not sell or share your personal information.</strong> We do not sell
          personal information to third parties, and we do not share personal information for
          cross-context behavioral advertising as defined under the CCPA/CPRA.
        </p>
        <p>
          To exercise your California privacy rights, contact us at{" "}
          <strong>support@trywireline.com</strong> or use the Delete Account option in Settings. We
          will respond to verified requests within 45 days.
        </p>
      </Section>

      <Section title="8. Cookies">
        <p>
          Wireline uses only strictly necessary first-party session storage required to maintain
          authentication. We do not use advertising, analytics, or cross-site tracking cookies.
          Under GDPR and the ePrivacy Directive, strictly necessary storage does not require your
          prior consent.
        </p>
      </Section>

      <Section title="9. Children's Privacy">
        <p>
          Wireline is not directed to children under 13. We do not knowingly collect personal
          information from children. If you believe a child has provided us with personal
          information, contact us and we will delete it promptly.
        </p>
      </Section>

      <Section title="10. Healthcare Data (HIPAA)">
        <p>
          <strong>Wireline is not HIPAA-certified at this time.</strong> Do not use Wireline to
          process or transmit Protected Health Information (PHI) as defined by the Health Insurance
          Portability and Accountability Act. Healthcare-adjacent use cases (appointment booking,
          intake forms, general scheduling) are supported, but any conversation that would expose
          patient diagnoses, treatments, or other PHI is out of scope for the platform until our
          HIPAA certification is in place.
        </p>
        <p>
          We will publicly announce HIPAA certification on this page and in our changelog once
          complete. Until then, healthcare account holders should treat Wireline as a
          general-purpose AI calling tool and limit conversations to non-PHI topics.
        </p>
      </Section>

      <Section title="11. Changes to This Policy">
        <p>
          We will post any material changes on this page with a new "Last updated" date and, where
          appropriate, notify you by email. Your continued use after the effective date constitutes
          acceptance.
        </p>
      </Section>

      <Section title="12. Contact">
        <p>
          Privacy questions or requests: <strong>support@trywireline.com</strong>
        </p>
      </Section>
    </LegalLayout>
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
        description="Wireline's terms of service — acceptable use, billing, telemarketing compliance (TCPA), limitation of liability, and governing law (Delaware). Last updated May 9, 2026."
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

      <Section title="5. Billing and Subscriptions">
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
          reason. The 30-day window starts on the date of your first paid invoice (not the trial
          start). Outbound call minutes consumed prior to the refund request are not separately
          deducted — the refund is on the subscription line item.
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

      <Section title="6. Data and Privacy">
        <p>
          Your use of Wireline is governed by our{" "}
          <Link to="/privacy" className="text-brand hover:text-brand/80 underline">
            Privacy Policy
          </Link>
          , which is incorporated into these Terms by reference.
        </p>
      </Section>

      <Section title="7. Intellectual Property">
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

      <Section title="8. Disclaimer of Warranties">
        <p>
          Wireline is provided "as is" and "as available" without warranty of any kind, express or
          implied, including warranties of merchantability, fitness for a particular purpose, or
          non-infringement. We do not warrant that the service will be uninterrupted, error-free, or
          free of viruses.
        </p>
      </Section>

      <Section title="9. Limitation of Liability">
        <p>
          To the maximum extent permitted by applicable law, <strong>Wireline</strong>'s total
          liability arising out of or related to these Terms or the service shall not exceed the
          amounts paid by you in the 12 months preceding the claim. We are not liable for any
          indirect, incidental, special, consequential, or punitive damages.
        </p>
      </Section>

      <Section title="10. Indemnification">
        <p>
          You agree to indemnify and hold harmless <strong>Wireline</strong> from any claims,
          damages, or expenses (including reasonable attorneys' fees) arising from your use of the
          service, violation of these Terms, or violation of any applicable law or third-party
          right.
        </p>
      </Section>

      <Section title="11. Governing Law">
        <p>
          These Terms are governed by the laws of <strong>Delaware, United States</strong>, without
          regard to conflict-of-law principles. Any disputes shall be resolved exclusively in the
          courts of <strong>Wilmington, Delaware</strong>.
        </p>
      </Section>

      <Section title="12. Modifications">
        <p>
          We may update these Terms with 14 days' advance notice posted on this page. Your continued
          use after the effective date constitutes acceptance of the revised Terms.
        </p>
      </Section>

      <Section title="13. Contact">
        <p>
          Legal notices: <strong>support@trywireline.com</strong>
        </p>
      </Section>
    </LegalLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Data Deletion Instructions — required by Meta / Facebook for any app that
// accesses user data. Linked from the Meta App Settings → User Data Deletion
// field. Mirrors the GDPR / soft-delete flow already wired into the app at
// Admin → Account → Delete Account.
// ─────────────────────────────────────────────────────────────────────────────
export function DataDeletion() {
  return (
    <LegalLayout title="Data Deletion" icon={Trash2}>
      <PageMeta
        title="Data Deletion — Wireline"
        description="How to delete your Wireline account and all associated personal data."
      />
      <Section title="Delete your account from the app">
        <p>
          The fastest path is to sign in and head to{" "}
          <strong>Admin → Account → Delete Account</strong>. Confirm the deletion in the modal and
          your account enters a 30-day soft-delete window. After that window, every row tied to your
          user is purged from our database: call logs, recordings, agent configurations, OAuth
          connections (Google, Microsoft, Yahoo, Apollo, HubSpot, Salesforce, Slack, Zoom, Meta),
          email accounts, lead records, billing history, audit trail. Hard delete is irreversible.
        </p>
      </Section>
      <Section title="Don't have access to your account?">
        <p>
          Email <strong>support@trywireline.com</strong> from the address tied to the account with
          the subject line <em>"Data deletion request"</em>. We verify the request out of band (text
          or call to a phone number on file) and then run the same deletion job manually. We confirm
          by email when the purge completes; SLA is 7 business days.
        </p>
      </Section>
      <Section title="What's deleted">
        <ul className="list-disc pl-5 space-y-1">
          <li>User profile (email, name, password hash)</li>
          <li>All agent configurations + uploaded knowledge documents</li>
          <li>Call logs, transcripts, recordings, sentiment scores</li>
          <li>Email threads, SMS threads, draft messages</li>
          <li>OAuth connections + encrypted access tokens</li>
          <li>Meta Lead Ads submissions ingested via webhook</li>
          <li>Apollo lead enrichment cache scoped to your account</li>
          <li>Billing history beyond what tax law requires us to retain</li>
        </ul>
      </Section>
      <Section title="What's retained">
        <p>
          Anonymized, aggregated metrics (total calls per day across all tenants, no identifiers)
          used for capacity planning. Tax records required by US law (invoices, payment receipts)
          for the statutory retention window. Audit log entries with your user ID redacted to a
          stable hash for legitimate security investigation purposes.
        </p>
      </Section>
      <Section title="Questions">
        <p>
          Reach us at <strong>support@trywireline.com</strong> with any data deletion question and
          we'll respond within 2 business days.
        </p>
      </Section>
    </LegalLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Zoom Integration Documentation
// Required by Zoom Marketplace review — "must be a Zoom-specific guide hosted
// on your domain that includes detailed instructions on adding, using and
// removing the app". Linked from the Zoom app dashboard Documentation URL
// field. Reviewers visit this page during approval to confirm the integration
// is what we claim it is.
// ─────────────────────────────────────────────────────────────────────────────
export function ZoomDocs() {
  return (
    <LegalLayout title="Zoom Integration" icon={Video}>
      <PageMeta
        title="Zoom Integration Guide — Wireline"
        description="How to add, use, and remove the Wireline Zoom integration. AI voice agents that book Zoom meetings during phone calls."
      />

      <Section title="Overview">
        <p>
          Wireline is a 24/7 AI calling Assistants. When a caller asks to schedule a meeting, your
          Wireline agent creates a Zoom meeting on your connected Zoom account in real time,
          confirms the date and time with the caller verbally, and sends the meeting invite via
          email or SMS before the call ends.
        </p>
        <p>
          This integration is per-tenant — each Wireline customer connects their own Zoom account.
          No shared credentials. No admin-pushed installs.
        </p>
      </Section>

      <Section title="Adding the Wireline app">
        <p>To connect your Zoom account to Wireline:</p>
        <ol className="list-decimal pl-5 space-y-2">
          <li>
            Sign in to Wireline at{" "}
            <a
              href="https://trywireline.com"
              className="text-brand hover:underline"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="trywireline.com (opens in new tab)"
            >
              trywireline.com
            </a>
            . If you don't have an account yet, sign up — the first 14 days are free.
          </li>
          <li>
            Open the <strong>Integrations</strong> page from the main navigation, or visit{" "}
            <a
              href="https://trywireline.com/integrations"
              className="text-brand hover:underline"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="trywireline.com/integrations (opens in new tab)"
            >
              trywireline.com/integrations
            </a>{" "}
            directly.
          </li>
          <li>
            Find the <strong>Zoom</strong> card and click <strong>Connect Zoom</strong>.
          </li>
          <li>
            You'll be redirected to Zoom's consent screen. Review the two requested permissions:
            <ul className="list-disc pl-5 mt-1 space-y-1">
              <li>
                <code>meeting:write:meeting</code> — Wireline uses this to create new Zoom meetings
                on your account when your AI agent books one during a call.
              </li>
              <li>
                <code>user:read:user</code> — Wireline reads your account email and display name
                once at connection so we can show "Connected as you@yourcompany.com" in our settings
                page.
              </li>
            </ul>
          </li>
          <li>
            Click <strong>Allow</strong>. Zoom will redirect you back to Wireline's Integrations
            page, which will now show a green "Connected" indicator on the Zoom card with your Zoom
            account email.
          </li>
        </ol>
      </Section>

      <Section title="Using the integration">
        <p>
          Once connected, your Wireline AI agents can book Zoom meetings automatically. No
          additional configuration is required — Wireline detects the connected Zoom account and
          uses it whenever an agent needs to schedule a meeting.
        </p>
        <p>Typical flow:</p>
        <ol className="list-decimal pl-5 space-y-2">
          <li>
            A caller phones one of your Wireline-managed numbers (inbound) or your Wireline agent
            dials out (outbound).
          </li>
          <li>
            During the conversation, the caller asks to schedule a meeting — for example, "Can we
            set up a 30-minute call next Tuesday at 2pm?"
          </li>
          <li>
            Your Wireline agent confirms the time, then calls Zoom's{" "}
            <code>POST /v2/users/me/meetings</code> API on your behalf to create the meeting on your
            connected Zoom account.
          </li>
          <li>
            The agent reads back the confirmed time and tells the caller they'll receive the invite
            shortly.
          </li>
          <li>
            Wireline sends the Zoom meeting invite to the caller via email or SMS (configurable per
            agent).
          </li>
          <li>
            The meeting appears immediately on your Zoom calendar and the connected email account.
          </li>
        </ol>
        <p>
          You can review every meeting booked by your AI agents in{" "}
          <strong>Phone / Call History</strong> in Wireline. Each call that booked a meeting links
          to the corresponding Zoom meeting record so you can review the conversation that led to
          the booking.
        </p>
      </Section>

      <Section title="What data Wireline accesses">
        <p>The Zoom integration uses only two scopes:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>
              <code>meeting:write:meeting</code>
            </strong>{" "}
            — Wireline calls this scope only to <em>create</em> new meetings on your account when
            your AI agent books one during a phone call. We do not read, update, or delete meetings
            that were not created by Wireline.
          </li>
          <li>
            <strong>
              <code>user:read:user</code>
            </strong>{" "}
            — Wireline reads your Zoom email and display name once at connection time so we can show
            which Zoom account is linked. We do not store your billing information, account plan, or
            other profile fields returned by the API.
          </li>
        </ul>
        <p>
          We do <strong>not</strong> request scopes for: meeting chat, meeting recordings,
          transcripts, participant data, your existing meeting list, in-meeting controls, or any
          administrative data. We do not share Zoom data with third parties.
        </p>
        <p>
          Meeting IDs and join URLs returned by Zoom are stored encrypted (AES-256) in Wireline's
          PostgreSQL database, attached to the call log they originated from, and visible only to
          the Wireline tenant who owns the account.
        </p>
      </Section>

      <Section title="Removing the Wireline app">
        <p>You can disconnect Wireline from your Zoom account at any time:</p>
        <ol className="list-decimal pl-5 space-y-2">
          <li>
            <strong>From Wireline:</strong> Visit{" "}
            <a
              href="https://trywireline.com/integrations"
              className="text-brand hover:underline"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="trywireline.com/integrations (opens in new tab)"
            >
              trywireline.com/integrations
            </a>
            , find the Zoom card, click the gear icon, and select <strong>Disconnect</strong>. This
            calls Zoom's <code>POST /oauth/revoke</code> endpoint to invalidate the access token
            immediately and removes the stored OAuth credentials from our database.
          </li>
          <li>
            <strong>From Zoom:</strong> Sign in to{" "}
            <a
              href="https://marketplace.zoom.us"
              className="text-brand hover:underline"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="marketplace.zoom.us (opens in new tab)"
            >
              marketplace.zoom.us
            </a>
            , go to <strong>Manage → Added Apps</strong>, find Wireline, and click{" "}
            <strong>Remove</strong>. Zoom will notify Wireline of the revocation via webhook, and
            we'll mark your Zoom integration as disconnected.
          </li>
        </ol>
        <p>
          After disconnection, your AI agents will no longer be able to book Zoom meetings until you
          reconnect. Existing meetings already created remain on your Zoom calendar — Wireline does
          not delete them.
        </p>
      </Section>

      <Section title="Troubleshooting">
        <p>
          <strong>"redirect_uri_mismatch" during connection.</strong> This is a server-side
          configuration issue on our end — please contact support (below) and we'll fix it
          immediately.
        </p>
        <p>
          <strong>"unauthorized_client" during connection.</strong> Your Zoom account may have
          administrator restrictions on third-party apps. Ask your Zoom admin to allow the Wireline
          app, or contact our support team for help.
        </p>
        <p>
          <strong>Agent didn't book a meeting that was requested on a call.</strong> Check the call
          log on Wireline's <strong>Logs</strong> page — the agent may have logged a follow-up task
          instead if the time wasn't clear. If you confirm the request was clear and the booking
          should have happened, contact support so we can review the transcript.
        </p>
      </Section>

      <Section title="Support">
        <p>
          For any issue with the Zoom integration, contact <strong>support@trywireline.com</strong>{" "}
          or visit{" "}
          <a
            href="https://trywireline.com/support"
            className="text-brand hover:underline"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="trywireline.com/support (opens in new tab)"
          >
            trywireline.com/support
          </a>
          . We respond within 1 business day.
        </p>
      </Section>
    </LegalLayout>
  );
}
