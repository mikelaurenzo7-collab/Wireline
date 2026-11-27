import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import MarketingChrome from "../components/marketing/MarketingChrome";
import { PageMeta } from "../lib/page-meta";

type PolicyDocument = "privacy" | "terms";

type LoadState =
  { status: "loading" } | { status: "ready"; brandName: string } | { status: "invalid" };

/**
 * The texting privacy policy and terms BotBound hosts for a business without
 * a website of its own. Carriers review these pages before they approve the
 * business's texting campaign, so the wording matches the campaign BotBound
 * files: a caller agrees on the call, STOP and HELP always work, and mobile
 * numbers are never shared for marketing. The brand name comes from a signed
 * link (`texting-policy-link.ts`).
 */
export default function TextingPolicyPage({ document }: { document: PolicyDocument }) {
  const { token = "" } = useParams();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    fetch(`/api/texting-policy/${encodeURIComponent(token)}`)
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as { brandName?: unknown };
        if (!active) return;
        setState(
          response.ok && typeof body.brandName === "string" && body.brandName
            ? { status: "ready", brandName: body.brandName }
            : { status: "invalid" },
        );
      })
      .catch(() => {
        if (active) setState({ status: "invalid" });
      });
    return () => {
      active = false;
    };
  }, [token]);

  const title = document === "privacy" ? "Texting Privacy Policy" : "Texting Terms";
  const brand = state.status === "ready" ? state.brandName : null;

  return (
    <MarketingChrome>
      <PageMeta
        title={brand ? `${brand} ${title}` : title}
        description={
          document === "privacy"
            ? "How a business using BotBound handles mobile numbers and texting permission."
            : "Terms for texts a business sends through BotBound: consent, frequency, STOP, and HELP."
        }
        path={`/texting/${token}/${document}`}
        noIndex
      />
      <article className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-6 sm:py-14">
        {state.status === "loading" ? (
          <p className="text-base text-muted-foreground" role="status">
            Loading…
          </p>
        ) : null}
        {state.status === "invalid" ? (
          <>
            <h1 className="mb-4 text-2xl font-semibold tracking-tight text-foreground">
              This Link Isn't Valid
            </h1>
            <p className="text-base leading-7 text-muted-foreground">
              Check the address in the text you received, or reply HELP to that text.
            </p>
          </>
        ) : null}
        {brand ? (
          <>
            <h1 className="mb-2 text-2xl font-semibold tracking-tight text-foreground">
              {brand} {title}
            </h1>
            <p className="mb-8 text-base text-muted-foreground">
              {brand} uses BotBound to answer its calls and send the texts callers ask for.
            </p>
            {document === "privacy" ? <PrivacyBody brand={brand} /> : <TermsBody brand={brand} />}
            <nav
              className="mt-10 flex flex-wrap gap-x-6 border-t border-border pt-5 text-sm"
              aria-label="Texting policies"
            >
              {document === "privacy" ? (
                <Link
                  className="inline-flex min-h-11 items-center text-brand underline"
                  to={`/texting/${token}/terms`}
                >
                  {brand} Texting Terms
                </Link>
              ) : (
                <Link
                  className="inline-flex min-h-11 items-center text-brand underline"
                  to={`/texting/${token}/privacy`}
                >
                  {brand} Texting Privacy Policy
                </Link>
              )}
              <Link
                className="inline-flex min-h-11 items-center text-brand underline"
                to="/privacy"
              >
                BotBound Privacy Policy
              </Link>
              <Link className="inline-flex min-h-11 items-center text-brand underline" to="/terms">
                BotBound Terms of Service
              </Link>
            </nav>
          </>
        ) : null}
      </article>
    </MarketingChrome>
  );
}

function Section({
  id,
  heading,
  children,
}: {
  id: string;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8 space-y-3" aria-labelledby={id}>
      <h2 id={id} className="text-xl font-semibold">
        {heading}
      </h2>
      {children}
    </section>
  );
}

function PrivacyBody({ brand }: { brand: string }) {
  return (
    <>
      <Section id="collected" heading="What Is Collected">
        <p className="leading-7 text-muted-foreground">
          When you ask {brand} for a text, it keeps your mobile number, the permission you gave on
          the call and when you gave it, and the texts sent to you and received from you.
        </p>
      </Section>
      <Section id="used" heading="How It Is Used">
        <p className="leading-7 text-muted-foreground">
          Only to send the information or appointment details you asked for, to answer when you text
          back, and to honor STOP and HELP. If {brand} misses your call, it may send you one text
          offering help.
        </p>
      </Section>
      <Section id="sharing" heading="No Sharing">
        <p className="leading-7 text-muted-foreground">
          No mobile information will be shared with third parties or affiliates for marketing or
          promotional purposes. Text messaging opt in data and consent are never shared with any
          third party. Mobile numbers are never sold.
        </p>
        <p className="leading-7 text-muted-foreground">
          BotBound and the phone carriers that deliver the texts handle your number only to provide
          this service.
        </p>
      </Section>
      <Section id="choices" heading="Your Choices">
        <p className="leading-7 text-muted-foreground">
          Reply <strong className="text-foreground">STOP</strong> to any text to stop messages, or{" "}
          <strong className="text-foreground">HELP</strong> for help. A record of your STOP is kept
          so it is always honored. Message frequency varies. Message and data rates may apply.
        </p>
      </Section>
      <Section id="contact" heading="Questions">
        <p className="leading-7 text-muted-foreground">
          Reply HELP to any text from {brand}. For how BotBound handles this information, email{" "}
          <a className="text-brand underline" href="mailto:support@botbound.app">
            support@botbound.app
          </a>
          .
        </p>
      </Section>
    </>
  );
}

function TermsBody({ brand }: { brand: string }) {
  return (
    <>
      <Section id="program" heading={`${brand} Customer Care Texts`}>
        <p className="leading-7 text-muted-foreground">
          During a call with the {brand} AI assistant, you can ask for information or an appointment
          confirmation by text. The assistant confirms your number and asks permission first, and a
          text is sent only after you agree. If {brand} misses your call, it may send you one text
          offering help.
        </p>
      </Section>
      <Section id="frequency" heading="Frequency and Cost">
        <p className="leading-7 text-muted-foreground">
          Message frequency varies with your requests. Message and data rates may apply.
        </p>
      </Section>
      <Section id="stop" heading="Stop Anytime">
        <p className="leading-7 text-muted-foreground">
          Reply <strong className="text-foreground">STOP</strong> to stop. You get one confirmation,
          then no more texts unless you reply <strong className="text-foreground">START</strong>.
          Reply <strong className="text-foreground">HELP</strong> for help.
        </p>
      </Section>
      <Section id="fine-print" heading="Fine Print">
        <p className="leading-7 text-muted-foreground">
          Agreeing to texts is not a condition of any purchase. Carriers are not liable for delayed
          or undelivered messages. {brand} sends these texts through BotBound, whose Terms of
          Service govern the platform.
        </p>
      </Section>
    </>
  );
}
