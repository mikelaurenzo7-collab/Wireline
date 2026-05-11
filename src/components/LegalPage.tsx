import { Link } from "react-router-dom";
import { Shield, FileText, ArrowLeft } from "lucide-react";

const LAST_UPDATED = "May 9, 2026";

// ─────────────────────────────────────────────────────────────────────────────
// Shared layout wrapper for legal pages
// ─────────────────────────────────────────────────────────────────────────────
function LegalLayout({ title, icon: Icon, children }: {
  title: string;
  icon: typeof Shield;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.25em] text-muted hover:text-ink transition-colors mb-10"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to app
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #0AC8D4, #9B59F5)" }}
          >
            <Icon className="w-5 h-5 text-paper" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        </div>
        <p className="text-[11px] text-muted mb-10">Last updated: {LAST_UPDATED}</p>

        <div className="prose prose-sm max-w-none space-y-8 text-ink/80 leading-relaxed">
          {children}
        </div>

        <div className="mt-16 pt-8 border-t border-black/8 flex flex-wrap gap-4 text-[10px] text-muted/50">
          <Link to="/privacy" className="hover:text-muted transition-colors">Privacy Policy</Link>
          <span>·</span>
          <Link to="/terms" className="hover:text-muted transition-colors">Terms of Service</Link>
          <span>·</span>
          <Link to="/privacy#ccpa" className="hover:text-muted transition-colors">Do Not Sell My Information</Link>
        </div>
      </div>
    </div>
  );
}

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id}>
      <h2 className="text-base font-semibold text-ink mb-3 border-b border-black/8 pb-2">{title}</h2>
      <div className="space-y-3 text-sm">{children}</div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Privacy Policy
// ─────────────────────────────────────────────────────────────────────────────
export function PrivacyPolicy() {
  return (
    <LegalLayout title="Privacy Policy" icon={Shield}>
      <div className="text-xs border border-amber-500/20 rounded-lg px-4 py-3 bg-amber-500/5 text-amber-600/80 leading-relaxed">
        <strong>Operator note:</strong> Replace this page with your own attorney-reviewed privacy policy before
        accepting paying customers. The text below is a good-faith placeholder covering Wireline's actual data
        flows, but it has not been reviewed by an attorney. Fill in your business name and contact details where
        indicated.
      </div>

      <Section title="1. Who We Are">
        <p>
          <strong>Wireline</strong> ("we", "our", or "us") operates the Wireline platform — an
          AI-powered omnichannel agent fleet for businesses. Questions about this policy can be sent to{" "}
          <strong>legal@wireline.app</strong>. This policy explains what data we collect, why, and your
          rights over it.
        </p>
      </Section>

      <Section title="2. Data We Collect">
        <p>
          <strong>Account data</strong> — Email address, authentication tokens, and account preferences provided
          during sign-up and use of the platform.
        </p>
        <p>
          <strong>Agent configuration</strong> — Names, personas, directives, knowledge base entries, and voice
          settings you create for your AI agents.
        </p>
        <p>
          <strong>Call data</strong> — Phone numbers, call recordings, transcripts, summaries, and metadata for
          calls handled by your agents. Voice calls are routed through Vapi (vapi.ai); transcripts are stored in
          our database.
        </p>
        <p>
          <strong>Email data</strong> — If you connect a Gmail or Microsoft account, we access email threads and
          messages you explicitly assign to agents for triage and drafting.
        </p>
        <p>
          <strong>Usage and billing data</strong> — Feature usage, AI model token consumption, and Stripe billing
          information. We do not store full payment card numbers.
        </p>
        <p>
          <strong>Log and diagnostic data</strong> — Server logs, error reports (via Sentry), and performance
          metrics used to operate and improve the service.
        </p>
      </Section>

      <Section title="3. How We Use Your Data">
        <p>
          We use collected data to: provide and operate the Wireline platform; process AI requests via Anthropic's
          Claude API; route and log voice calls via Vapi; send scheduled email briefs via your linked Gmail/Outlook
          account; bill you via Stripe; and monitor platform health via Sentry.
        </p>
        <p>
          We do <strong>not</strong> sell or share your personal information with third parties for advertising or
          cross-context behavioral advertising. We do not use your agent configurations or call transcripts to
          train AI models — ours or any third party's.
        </p>
      </Section>

      <Section title="4. Third-Party Sub-Processors">
        <p>We rely on the following sub-processors to deliver the service:</p>
        <ul className="list-disc list-inside space-y-1.5 ml-2">
          <li><strong>Supabase</strong> (supabase.com) — Database, authentication, and file storage</li>
          <li><strong>Vapi</strong> (vapi.ai) — Voice AI infrastructure and call routing</li>
          <li><strong>Anthropic</strong> (anthropic.com) — AI model inference (Claude)</li>
          <li><strong>Stripe</strong> (stripe.com) — Payment processing and billing</li>
          <li><strong>Sentry</strong> (sentry.io) — Error monitoring and diagnostics</li>
          <li><strong>Vercel</strong> (vercel.com) — Platform hosting and edge delivery</li>
        </ul>
      </Section>

      <Section title="5. Data Retention">
        <p>
          Call logs and transcripts are retained for as long as your account is active. You may delete individual
          call records at any time from the Call Logs view. Upon account deletion, all associated personal data is
          permanently erased within 30 days.
        </p>
      </Section>

      <Section title="6. Your Rights (EEA / UK / Canada)">
        <p>
          If you are located in the European Economic Area, United Kingdom, or Canada, you have the right to:
          access a copy of your personal data; correct inaccurate data; request erasure; object to or restrict
          processing; and receive your data in a portable format. To exercise these rights, use the{" "}
          <strong>Delete Account</strong> option in Settings, or contact us at the address below.
        </p>
        <p>
          Where we rely on legitimate interests as the legal basis for processing, you have the right to object.
          Our lawful basis for processing account and usage data is the performance of a contract (providing the
          service you subscribed to).
        </p>
      </Section>

      <Section id="ccpa" title="7. California Privacy Rights (CCPA / CPRA)">
        <p>
          If you are a California resident, you have the following rights under the California Consumer Privacy
          Act (CCPA) and California Privacy Rights Act (CPRA):
        </p>
        <ul className="list-disc list-inside space-y-1.5 ml-2">
          <li><strong>Right to know</strong> — what personal information we collect, use, and disclose</li>
          <li><strong>Right to delete</strong> — request deletion of your personal information</li>
          <li><strong>Right to correct</strong> — request correction of inaccurate personal information</li>
          <li><strong>Right to opt-out</strong> — opt out of the sale or sharing of personal information</li>
          <li><strong>Right to limit use</strong> — limit use of sensitive personal information</li>
          <li><strong>Right to non-discrimination</strong> — we will not discriminate for exercising these rights</li>
        </ul>
        <p className="mt-3 p-3 rounded-lg border border-brand/20 bg-brand/5 text-brand/90 text-[12px]">
          <strong>We do not sell or share your personal information.</strong> We do not sell personal information
          to third parties, and we do not share personal information for cross-context behavioral advertising as
          defined under the CCPA/CPRA.
        </p>
        <p>
          To exercise your California privacy rights, contact us at{" "}
          <strong>legal@wireline.app</strong> or use the Delete Account option in Settings.
          We will respond to verified requests within 45 days.
        </p>
      </Section>

      <Section title="8. Cookies">
        <p>
          Wireline uses only strictly necessary cookies required to maintain your authentication session (a
          single first-party session cookie set by Supabase Auth). We do not use advertising, analytics, or
          cross-site tracking cookies. Under GDPR and the ePrivacy Directive, strictly necessary cookies do not
          require your prior consent.
        </p>
      </Section>

      <Section title="9. Children's Privacy">
        <p>
          Wireline is not directed to children under 13. We do not knowingly collect personal information from
          children. If you believe a child has provided us with personal information, contact us and we will
          delete it promptly.
        </p>
      </Section>

      <Section title="10. Changes to This Policy">
        <p>
          We will post any material changes on this page with a new "Last updated" date and, where appropriate,
          notify you by email. Your continued use after the effective date constitutes acceptance.
        </p>
      </Section>

      <Section title="11. Contact">
        <p>
          Privacy questions or requests: <strong>legal@wireline.app</strong>
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
    <LegalLayout title="Terms of Service" icon={FileText}>
      <div className="text-xs border border-amber-500/20 rounded-lg px-4 py-3 bg-amber-500/5 text-amber-600/80 leading-relaxed">
        <strong>Operator note:</strong> Replace this page with your own attorney-reviewed Terms of Service before
        accepting paying customers. Fill in your company name, jurisdiction, and contact details where indicated.
      </div>

      <Section title="1. Acceptance">
        <p>
          By accessing or using Wireline you agree to these Terms of Service ("Terms"). If you do not agree, do
          not use the service. These Terms constitute a binding agreement between you and{" "}
          <strong>Wireline</strong>.
        </p>
      </Section>

      <Section title="2. Service Description">
        <p>
          Wireline provides AI-powered voice and email agent infrastructure for businesses. The service includes
          agent configuration tools, call routing, email triage, outbound dialing campaigns, a DNC manager, and
          analytics.
        </p>
      </Section>

      <Section title="3. Acceptable Use">
        <p>You agree not to use Wireline to:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Dial numbers on the National Do Not Call Registry without a valid exemption</li>
          <li>Send unsolicited commercial messages (spam) in violation of CAN-SPAM, CASL, or similar laws</li>
          <li>Impersonate any person or organisation</li>
          <li>Violate any telemarketing law including the TCPA (US), CASL (Canada), or applicable state law</li>
          <li>Process highly sensitive categories of personal data (health, financial) without appropriate safeguards</li>
          <li>Reverse-engineer, scrape, or abuse the platform's APIs beyond their intended purpose</li>
          <li>Use the platform for illegal purposes or to facilitate illegal activity</li>
        </ul>
      </Section>

      <Section title="4. Telemarketing Compliance">
        <p>
          You are solely responsible for ensuring all outbound calls and messages comply with applicable laws,
          including the Telephone Consumer Protection Act (TCPA), FTC regulations, and any state or local laws.
          Wireline provides DNC list management tools to assist compliance, but does not guarantee your legal
          compliance and accepts no liability for regulatory violations.
        </p>
      </Section>

      <Section title="5. Billing and Subscriptions">
        <p>
          Paid features are billed monthly via Stripe. Subscriptions renew automatically unless cancelled before
          the renewal date. You may cancel at any time via the Billing section in Settings; cancellation
          takes effect at the end of the current billing period. No refunds are issued for partial periods.
        </p>
        <p>
          We reserve the right to change pricing with 30 days' notice. Your continued use after the effective
          date constitutes acceptance of the new pricing.
        </p>
      </Section>

      <Section title="6. Data and Privacy">
        <p>
          Your use of Wireline is governed by our{" "}
          <Link to="/privacy" className="text-brand hover:text-brand/80 underline">Privacy Policy</Link>, which
          is incorporated into these Terms by reference.
        </p>
      </Section>

      <Section title="7. Intellectual Property">
        <p>
          You retain full ownership of your agent configurations, knowledge base content, call recordings, and
          all other data you create in Wireline. By using the platform you grant us a limited, non-exclusive
          license to process this data solely to provide the service.
        </p>
        <p>
          All platform code, design, trademarks, and other IP belonging to <strong>Wireline</strong>{" "}
          remain our exclusive property. You may not copy, modify, or distribute any part of the platform.
        </p>
      </Section>

      <Section title="8. Disclaimer of Warranties">
        <p>
          Wireline is provided "as is" and "as available" without warranty of any kind, express or implied,
          including warranties of merchantability, fitness for a particular purpose, or non-infringement.
          We do not warrant that the service will be uninterrupted, error-free, or free of viruses.
        </p>
      </Section>

      <Section title="9. Limitation of Liability">
        <p>
          To the maximum extent permitted by applicable law, <strong>Wireline</strong>'s total
          liability arising out of or related to these Terms or the service shall not exceed the amounts paid
          by you in the 12 months preceding the claim. We are not liable for any indirect, incidental, special,
          consequential, or punitive damages.
        </p>
      </Section>

      <Section title="10. Indemnification">
        <p>
          You agree to indemnify and hold harmless <strong>Wireline</strong> from any claims,
          damages, or expenses (including reasonable attorneys' fees) arising from your use of the service,
          violation of these Terms, or violation of any applicable law or third-party right.
        </p>
      </Section>

      <Section title="11. Governing Law">
        <p>
          These Terms are governed by the laws of <strong>Delaware, United States</strong>, without regard to
          conflict-of-law principles. Any disputes shall be resolved exclusively in the courts of{" "}
          <strong>Wilmington, Delaware</strong>.
        </p>
      </Section>

      <Section title="12. Modifications">
        <p>
          We may update these Terms with 14 days' advance notice posted on this page. Your continued use after
          the effective date constitutes acceptance of the revised Terms.
        </p>
      </Section>

      <Section title="13. Contact">
        <p>
          Legal notices: <strong>legal@wireline.app</strong>
        </p>
      </Section>
    </LegalLayout>
  );
}
