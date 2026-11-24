import { Link } from "react-router";
import MarketingChrome from "../components/marketing/MarketingChrome";
import { PageMeta } from "../lib/page-meta";

/** Public review document for BotBound's own customer-care sender. */
export default function SmsConsentPage() {
  return (
    <MarketingChrome>
      <PageMeta
        title="SMS Consent | BotBound"
        description="Text BotBound for customer care, or review how we obtain permission for call follow ups and honor STOP and HELP."
        path="/sms-consent"
        noIndex
      />
      <article className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-6 sm:py-14">
        <h1 className="mb-5 text-2xl font-semibold tracking-tight text-foreground">
          BotBound Customer Care Texts
        </h1>
        <p className="text-base leading-7 text-muted-foreground">
          BotBound LLC uses its own customer service number to answer support questions, send
          information requested during a call, and follow up about appointments. These are
          non-promotional conversations with BotBound, not messages sent on behalf of other
          businesses using our platform.
        </p>

        <section className="mt-10 space-y-4" aria-labelledby="start-by-text">
          <h2 id="start-by-text" className="text-xl font-semibold">
            Start a Support Conversation by Text
          </h2>
          <p className="leading-7 text-muted-foreground">
            Text your BotBound question to{" "}
            <a className="font-semibold text-brand underline" href="sms:+17736949780">
              (773) 694-9780
            </a>
            . By sending a question to this number, you request replies from BotBound about that
            conversation. An AI assistant or a person may answer. We do not add you to a marketing
            list or send unrelated offers. Do not text sensitive personal information.
          </p>
          <p className="rounded-md border border-border bg-muted/30 p-4 text-sm leading-6">
            Message frequency varies with the conversation. Message and data rates may apply. Reply
            STOP to opt out or HELP for help. Texting is optional and is not a condition of purchase.
            Read our <Link className="text-brand underline" to="/terms">Terms of Service</Link> and{" "}
            <Link className="text-brand underline" to="/privacy">Privacy Policy</Link> before
            texting. You can also email{" "}
            <a className="text-brand underline" href="mailto:support@botbound.app">
              support@botbound.app
            </a>
            .
          </p>
          <p className="leading-7 text-muted-foreground">
            Your first message is the request to begin this customer-care conversation. A reply to
            that request may be automated. A message to us does not give permission for unrelated
            future outreach.
          </p>
        </section>

        <section className="mt-10 space-y-4" aria-labelledby="verbal-consent">
          <h2 id="verbal-consent" className="text-xl font-semibold">
            Texts Requested During a Call
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

        <section className="mt-10 space-y-4" aria-labelledby="missed-call">
          <h2 id="missed-call" className="text-xl font-semibold">
            If We Miss Your Call
          </h2>
          <p className="leading-7 text-muted-foreground">
            If you call this number and we cannot answer, BotBound may send one text offering to
            help, with an opt-out instruction. We do not send a missed-call text to a number that
            did not call us. Further conversation follows only if you reply or request it.
          </p>
        </section>

        <section className="mt-10 space-y-4" aria-labelledby="message-example">
          <h2 id="message-example" className="text-xl font-semibold">
            Example Messages
          </h2>
          <blockquote className="rounded-lg border border-border bg-muted/30 p-5 text-base leading-7">
            BotBound: Here is the information you requested during your call:
            https://botbound.app/pricing. Reply STOP to unsubscribe or HELP for help. Message and
            data rates may apply.
          </blockquote>
          <blockquote className="rounded-lg border border-border bg-muted/30 p-5 text-base leading-7">
            BotBound: Thanks for texting. What can we help you with? Message frequency varies.
            Message and data rates may apply. Reply STOP to opt out or HELP for help.
          </blockquote>
        </section>

        <section className="mt-10 space-y-4" aria-labelledby="recipient-choice">
          <h2 id="recipient-choice" className="text-xl font-semibold">
            Your Choice, Every Time
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
            No mobile information will be shared with third parties or affiliates for marketing or
            promotional purposes. Mobile contact information and SMS opt in records are not sold or
            shared with any third party.
          </p>
        </section>

        <section className="mt-10 space-y-4" aria-labelledby="activation-records">
          <h2 id="activation-records" className="text-xl font-semibold">
            How We Keep Permission
          </h2>
          <p className="leading-7 text-muted-foreground">
            For call-requested texts, BotBound retains the affirmative answer with the destination,
            time, sender, and conversation reference. For customer-initiated texts, we retain the
            inbound message and limit replies to that conversation. We check opt-out records before
            subsequent sends. This page describes how to request texts; it does not prove that any
            particular person consented.
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
