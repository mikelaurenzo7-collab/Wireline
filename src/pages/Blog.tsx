import { Check, MessageSquare, PhoneCall, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import { PageMeta } from "../lib/page-meta";
import { Button } from "../components/atoms";

const SITE_URL = "https://trywireline.com";

const NOTES = [
  {
    icon: PhoneCall,
    title: "Start with one repeatable call.",
    copy: "The best first job is clear and common: check a refill, confirm an appointment, ask about an order, or get through a support queue.",
  },
  {
    icon: MessageSquare,
    title: "Write down the boundaries.",
    copy: "Tell your agent what it can say, what it should not do, and when it should stop and ask you to take over.",
  },
  {
    icon: Check,
    title: "Ask for the useful result.",
    copy: "A good handoff ends with a plain answer and the next step, not a long transcript you have to decode.",
  },
] as const;

function noteSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Wireline", item: `${SITE_URL}/` },
        { "@type": "ListItem", position: 2, name: "Wireline Notes", item: `${SITE_URL}/blog` },
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: NOTES.map(({ title, copy }) => ({
        "@type": "Question",
        name: title.replace(/\.$/, ""),
        acceptedAnswer: { "@type": "Answer", text: copy },
      })),
    },
    {
      "@type": "CollectionPage",
      name: "Wireline Notes",
      description:
        "Practical guides for AI call agents — appointments, support queues, handoff boundaries, and getting time back.",
      url: `${SITE_URL}/blog`,
    },
  ],
};

export default function Blog() {
  return (
    <MarketingPageFrame mainClassName="!px-0 pb-0 pt-20 sm:pt-24">
      <PageMeta
        title="Wireline Notes | AI call agent guides for small business phone coverage"
        description="Practical guides for AI voice agents: appointment booking, support queues, handoff boundaries, and getting routine phone work off your plate."
        path="/blog"
        structuredData={structuredData}
      />

      <section className="mx-auto max-w-6xl px-5 pb-16 pt-14 text-center sm:px-8 sm:pb-20 sm:pt-20 lg:px-10">
        <div className="mx-auto max-w-3xl">
          <p className="wl-stitch-eyebrow">Wireline Notes</p>
          <h1 className="wl-stitch-marketing-hero mt-4 text-balance">
            Practical notes for getting time back.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-8 text-muted-foreground">
            Wireline is keeping this library small until each guide earns its place. Start with the
            basics that make an agent useful from day one — clear jobs, firm boundaries, and useful
            handoffs.
          </p>
          <nav
            className="mx-auto mt-7 flex max-w-2xl flex-wrap justify-center gap-2"
            aria-label="Browse Wireline notes"
          >
            {NOTES.map(({ title }) => (
              <a
                key={title}
                href={`#${noteSlug(title)}`}
                className="inline-flex min-h-10 items-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                {title.replace(/\.$/, "")}
              </a>
            ))}
          </nav>
        </div>
      </section>

      <section className="border-y border-border bg-card px-5 py-5 sm:px-8 sm:py-7">
        <div className="mx-auto grid max-w-6xl gap-px overflow-hidden border border-border bg-border md:grid-cols-3">
          {NOTES.map(({ icon: Icon, title, copy }) => (
            <article
              id={noteSlug(title)}
              className="bg-card px-5 py-8 text-center sm:px-7 sm:py-10"
              key={title}
            >
              <span className="mx-auto grid h-9 w-9 place-items-center rounded bg-muted text-primary">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <h2 className="mt-6 text-lg font-semibold tracking-[-.025em] text-foreground">
                {title}
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                {copy}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
        <div className="wl-stitch-card wl-stitch-card-brand p-7 sm:p-10">
          <div className="mx-auto max-w-2xl text-center">
            <div className="inline-flex items-center gap-2 text-sm font-medium text-[var(--wireline-color-text-secondary)]">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />A private draft is a good place
              to begin.
            </div>
            <h2 className="mt-4 text-balance text-3xl font-semibold tracking-[-.045em] sm:text-4xl">
              Teach an agent the call you keep putting off.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-[var(--wireline-color-text-secondary)]">
              Name it, describe the task in plain language, and refine the rules as you go.
            </p>
            <div className="wl-marketing-actions mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button asChild variant="primary" size="lg">
                <Link to="/signup">Start free</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/features">See how it works</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
