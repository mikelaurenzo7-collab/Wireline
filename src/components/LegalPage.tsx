import { Link } from "react-router-dom";
import { Shield, FileText, ArrowLeft } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Shared layout wrapper for legal pages
// ─────────────────────────────────────────────────────────────────────────────
function LegalLayout({ title, icon: Icon, children }: {
  title: string;
  icon: typeof Shield;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-ink">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.25em] text-muted hover:text-ink transition-colors mb-10"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to app
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #0AC8D4, #9B59F5)" }}>
            <Icon className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        </div>
        <p className="text-[11px] text-muted mb-10">
          Last updated: {new Date("2026-01-01").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
        </p>

        <div className="prose prose-invert prose-sm max-w-none space-y-8 text-ink/80 leading-relaxed">
          {children}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-ink mb-3 border-b border-white/8 pb-2">{title}</h2>
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
      <Section title="1. Who We Are">
        <p>
          Wireline ("we", "our", or "us") operates the Wireline platform — an AI-powered omnichannel agent fleet for
          businesses. This policy explains what data we collect, why, and your rights over it.
        </p>
        <p className="text-amber-400/80 text-xs border border-amber-500/20 rounded-lg px-3 py-2 bg-amber-500/5">
          <strong>Note for operators:</strong> Replace this page with your own legal-reviewed privacy policy before
          accepting paying customers. The text below is a good-faith placeholder covering the platform's actual
          data flows, but it has not been reviewed by an attorney.
        </p>
      </Section>

      <Section title="2. Data We Collect">
        <p><strong>Account data</strong> — Email address, authentication tokens, and account preferences provided
          during sign-up and use of the platform.</p>
        <p><strong>Agent configuration</strong> — Names, personas, directives, knowledge base entries, and voice
          settings you create for your AI agents.</p>
        <p><strong>Call data</strong> — Phone numbers, call recordings, transcripts, summaries, and metadata for
          calls handled by your agents. Call recordings are processed by Vapi (vapi.ai) and transcripts are stored
          in our database.</p>
        <p><strong>Email data</strong> — If you connect a Gmail or Microsoft account, we access email threads and
          messages you explicitly assign to agents for triage and drafting purposes.</p>
        <p><strong>Usage and billing data</strong> — Feature usage, AI model token consumption, and Stripe billing
          information. We do not store full payment card numbers.</p>
        <p><strong>Log and diagnostic data</strong> — Server logs, error reports (via Sentry), and performance
          metrics used to operate and improve the service.</p>
      </Section>

      <Section title="3. How We Use Your Data">
        <p>We use collected data to: provide and operate the Wireline platform; process AI requests via Anthropic's
          Claude API; route and log voice calls via Vapi; send scheduled email briefs via your linked Gmail/Outlook
          account; bill you via Stripe; and monitor platform health via Sentry.</p>
        <p>We do <strong>not</strong> sell your data. We do not use your agent configurations or call transcripts to
          train our AI models or any third-party models.</p>
      </Section>

      <Section title="4. Third-Party Services">
        <p>We rely on these sub-processors:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Supabase</strong> — Database and authentication hosting (supabase.com)</li>
          <li><strong>Vapi</strong> — Voice AI infrastructure (vapi.ai)</li>
          <li><strong>Anthropic</strong> — AI model inference (anthropic.com)</li>
          <li><strong>Stripe</strong> — Payment processing (stripe.com)</li>
          <li><strong>Sentry</strong> — Error monitoring (sentry.io)</li>
          <li><strong>Vercel</strong> — Platform hosting (vercel.com)</li>
        </ul>
      </Section>

      <Section title="5. Data Retention">
        <p>Call logs and transcripts are retained for as long as your account is active. You may delete individual
          call records at any time from the Call Logs view. Upon account deletion, all associated data is permanently
          removed within 30 days.</p>
      </Section>

      <Section title="6. Your Rights (GDPR / CCPA)">
        <p>If you are located in the European Economic Area, UK, or California, you have the right to: access a
          copy of your data; correct inaccurate data; request deletion of your data; and object to certain
          processing. To exercise these rights, use the <strong>Delete Account</strong> option in Command Atlas →
          Settings, or contact us at the address below.</p>
      </Section>

      <Section title="7. Cookies">
        <p>Wireline uses only functionally necessary cookies required to maintain authentication sessions. We do not
          use advertising or cross-site tracking cookies.</p>
      </Section>

      <Section title="8. Contact">
        <p>Questions about this policy? Contact us at <strong>[your-support-email@example.com]</strong>.</p>
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
      <Section title="1. Acceptance">
        <p>
          By accessing or using Wireline, you agree to these Terms. If you do not agree, do not use the service.
        </p>
        <p className="text-amber-400/80 text-xs border border-amber-500/20 rounded-lg px-3 py-2 bg-amber-500/5">
          <strong>Note for operators:</strong> Replace this page with your own attorney-reviewed Terms of Service
          before accepting paying customers. The text below is a good-faith placeholder.
        </p>
      </Section>

      <Section title="2. Service Description">
        <p>Wireline provides AI-powered voice and email agent infrastructure for businesses. The service includes
          agent configuration tools, call routing, email triage, outbound dialing, and analytics.</p>
      </Section>

      <Section title="3. Acceptable Use">
        <p>You agree not to use Wireline to:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Dial numbers on the National Do Not Call Registry without a valid exemption</li>
          <li>Send unsolicited commercial emails (spam)</li>
          <li>Impersonate individuals or organisations</li>
          <li>Violate any applicable telemarketing law, including the TCPA (US), CASL (Canada), or similar</li>
          <li>Process sensitive personal data (health records, financial accounts) without appropriate safeguards</li>
          <li>Reverse-engineer, scrape, or abuse the platform's APIs</li>
        </ul>
      </Section>

      <Section title="4. Telemarketing Compliance">
        <p>You are solely responsible for ensuring all outbound calls and messages comply with applicable laws,
          including the Telephone Consumer Protection Act (TCPA), FTC regulations, and any state laws. Wireline
          provides DNC list management tools but does not guarantee legal compliance on your behalf.</p>
      </Section>

      <Section title="5. Billing and Subscriptions">
        <p>Paid features are billed monthly via Stripe. Subscriptions auto-renew unless cancelled. You may cancel
          at any time via the Billing section in Command Atlas; cancellation takes effect at the end of the current
          billing period. No refunds are issued for partial periods.</p>
      </Section>

      <Section title="6. Data and Privacy">
        <p>Your use of Wireline is also governed by our <Link to="/privacy" className="text-brand hover:text-brand/80 underline">Privacy Policy</Link>.</p>
      </Section>

      <Section title="7. Intellectual Property">
        <p>You retain ownership of your agent configurations, knowledge base content, and call data. By using the
          platform you grant us a limited license to process this data to provide the service.</p>
      </Section>

      <Section title="8. Limitation of Liability">
        <p>To the maximum extent permitted by law, Wireline is provided "as is" without warranty. We are not liable
          for any indirect, incidental, or consequential damages arising from your use of the service.</p>
      </Section>

      <Section title="9. Modifications">
        <p>We may update these Terms with 14 days' notice. Continued use after the effective date constitutes
          acceptance of the revised Terms.</p>
      </Section>

      <Section title="10. Contact">
        <p>Legal notices: <strong>[your-legal-email@example.com]</strong>.</p>
      </Section>
    </LegalLayout>
  );
}
