import { Link } from "react-router";
import MarketingChrome from "../components/marketing/MarketingChrome";
import { PageMeta } from "../lib/page-meta";

/** Public review document for BotBound's own customer-care sender. */
export default function SmsConsentPage() {
  return (
    <MarketingChrome>
      <PageMeta
        title="SMS Consent | BotBound"
        description="BotBound customer care SMS: permission script, message examples, and instructions to stop messages."
        path="/sms-consent"
        noIndex
      />
      <article className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-6 sm:py-14">
        <h1 className="marketing-hero-title mb-5 text-3xl sm:text-4xl">
          Permission before a text.
        </h1>
        <p className="mb-4 text-base text-muted-foreground">BotBound Customer Care</p>
        <p className="text-base leading-7 text-muted-foreground">
          BotBound uses its own customer service number for information and support requested during
          a conversation. This program does not include cold outreach, purchased lists, or marketing
          campaigns.
        </p>
        <p className="mt-4 rounded-md border border-border bg-muted/30 p-4 text-sm leading-6">
          SMS activation is pending carrier verification. This page documents the opt in flow
          required for activation; it does not collect consent or show that any person has already
          agreed to receive messages.
        </p>

        <section className="mt-10 space-y-4" aria-labelledby="verbal-consent">
          <h2 id="verbal-consent" className="text-xl font-semibold">
            How we ask
          </h2>
          <p className="leading-7 text-muted-foreground">
            When a caller requests information by text, the Bot confirms the destination and asks
            for permission before sending. Merely calling BotBound does not enroll the caller in
            text messaging.
          </p>
          <blockquote className="border-l-2 border-brand pl-5 text-base leading-8">
            “May BotBound text the information you requested to this number? Message frequency
            varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. You
            can read our terms and privacy policy at botbound.app. Texts are optional and consent is
            not a condition of purchase. Do you agree?”
          </blockquote>
          <p className="leading-7 text-muted-foreground">
            A clear affirmative reply is required. A refusal, silence, or an unclear answer means no
            text is sent. Permission applies to the requested customer care follow up, not unrelated
            offers or messages from other businesses.
          </p>
        </section>

        <section className="mt-10 space-y-4" aria-labelledby="message-example">
          <h2 id="message-example" className="text-xl font-semibold">
            Example message
          </h2>
          <blockquote className="rounded-lg border border-border bg-muted/30 p-5 text-base leading-7">
            BotBound: Here is the information you requested during your call:
            https://botbound.app/pricing. Reply STOP to unsubscribe or HELP for help. Message and
            data rates may apply.
          </blockquote>
        </section>

        <section className="mt-10 space-y-4" aria-labelledby="recipient-choice">
          <h2 id="recipient-choice" className="text-xl font-semibold">
            Your choice, every time
          </h2>
          <p className="leading-7 text-muted-foreground">
            Reply <strong className="text-foreground">STOP</strong> to stop further messages from
            that number. Reply <strong className="text-foreground">HELP</strong> for support, or
            email{" "}
            <a className="text-brand underline" href="mailto:support@botbound.app">
              support@botbound.app
            </a>
            . Message frequency depends on your requests. Carriers may charge for messages and data
            and are not liable for delayed or undelivered messages.
          </p>
          <p className="leading-7 text-muted-foreground">
            Mobile contact information and SMS opt in records are not sold or shared with third
            parties for their marketing.
          </p>
        </section>

        <section className="mt-10 space-y-4" aria-labelledby="activation-records">
          <h2 id="activation-records" className="text-xl font-semibold">
            Before activation
          </h2>
          <p className="leading-7 text-muted-foreground">
            The sender must be verified and the Bot must use this permission flow. Each recipient’s
            affirmative response must be retained with the destination, time, sender, and
            conversation reference before sending. Opt out records must be checked on subsequent
            sends. This public script is documentation, not a substitute for those individual
            records.
          </p>
          <p className="leading-7 text-muted-foreground">
            Businesses using BotBound need their own sender verification, business identity, and
            recipient permissions. This page covers BotBound’s own customer care program.
          </p>
        </section>

        <nav
          className="mt-10 flex flex-wrap gap-x-6 border-t border-border pt-5 text-sm"
          aria-label="SMS policies"
        >
          <Link className="inline-flex min-h-11 items-center text-brand underline" to="/privacy">
            Privacy Policy
          </Link>
          <Link className="inline-flex min-h-11 items-center text-brand underline" to="/terms">
            Terms of Service
          </Link>
          <Link className="inline-flex min-h-11 items-center text-brand underline" to="/contact">
            Contact BotBound
          </Link>
        </nav>
      </article>
    </MarketingChrome>
  );
}
