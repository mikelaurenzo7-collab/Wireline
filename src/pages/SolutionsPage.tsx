import { Link, useParams } from "react-router-dom";
import { ArrowRight, Headphones, PhoneOutgoing } from "lucide-react";
import PrecisionPublicHeader from "../components/marketing/PrecisionPublicHeader";
import { PageMeta } from "../lib/page-meta";

const SOLUTIONS = {
  sales: {
    title: "Outbound calls that keep moving",
    description:
      "Wireline can follow up, wait on hold, and book time on your calendar — whether you are closing a lead or calling the pharmacy back.",
    eyebrow: "Outbound",
    icon: PhoneOutgoing,
    bullets: [
      "Follow up without sitting on hold yourself",
      "Capture answers and next steps in a text",
      "Train each assistant on what it may promise",
    ],
    cta: { href: "/pricing", label: "See personal & business plans" },
    secondary: { href: "/showcase", label: "Hear a sample call" },
  },
  support: {
    title: "Inbound help with a human handoff",
    description:
      "For business teams, Wireline answers routine questions from your knowledge base and routes anything sensitive back to you.",
    eyebrow: "Inbound",
    icon: Headphones,
    bullets: [
      "Ground answers in facts, rules, and tone you approve",
      "Escalate unclear or high-stakes conversations",
      "Scope actions per assistant — not blanket access",
    ],
    cta: { href: "/solutions/sales", label: "See outbound use cases" },
    secondary: { href: "/features", label: "How personal calls work" },
  },
} as const;

type SolutionKey = keyof typeof SOLUTIONS;

export default function SolutionsPage() {
  const { wedge = "support" } = useParams<{ wedge: string }>();
  const key = (wedge in SOLUTIONS ? wedge : "support") as SolutionKey;
  const page = SOLUTIONS[key];
  const Icon = page.icon;

  return (
    <>
      <PageMeta
        title={`${page.title} — Wireline`}
        description={page.description}
        path={`/solutions/${key}`}
      />
      <div className="wl-stitch-gradient-radial min-h-screen bg-background text-foreground">
        <PrecisionPublicHeader />
        <main id="main-content" className="mx-auto max-w-4xl px-6 pb-20 pt-28 text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1">
            <Icon size={14} className="text-primary" />
            <span className="wl-stitch-label">{page.eyebrow}</span>
          </div>
          <h1 className="wl-stitch-marketing-hero mx-auto mt-8 max-w-3xl text-balance">
            {page.title}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground">
            {page.description}
          </p>
          <ul className="mx-auto mt-10 max-w-md space-y-3 text-left text-[15px] text-muted-foreground">
            {page.bullets.map((item) => (
              <li key={item} className="flex gap-3">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              to={page.cta.href}
              className="marketing-btn-primary min-h-12 px-6 text-[15px] font-semibold"
            >
              {page.cta.label}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to={page.secondary.href}
              className="marketing-btn-secondary min-h-12 px-6 text-[15px] font-semibold"
            >
              {page.secondary.label}
            </Link>
          </div>
        </main>
        <footer className="border-t border-border bg-card px-6 py-8 text-center text-sm text-muted-foreground">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">
            <span className="font-bold text-primary">Wireline</span>
            <div className="flex gap-6">
              <Link to="/privacy" className="hover:text-foreground">
                Privacy
              </Link>
              <Link to="/terms" className="hover:text-foreground">
                Terms
              </Link>
              <Link to="/support" className="hover:text-foreground">
                Support
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
