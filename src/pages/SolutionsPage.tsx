import { Link, useParams } from "react-router";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import { PageMeta } from "../lib/page-meta";

const SOLUTIONS = {
  sales: {
    title: "Sales",
    description: "Create a Bot for sales. Add another whenever you want one.",
    primary: { href: "/signup?wedge=sales", label: "Create a Bot" },
  },
  support: {
    title: "Front Desk",
    description: "Create a Bot for the front desk. Add another whenever you want one.",
    primary: { href: "/signup?wedge=support", label: "Create a Bot" },
  },
} as const;

type SolutionKey = keyof typeof SOLUTIONS;

export default function SolutionsPage() {
  const { wedge = "support" } = useParams<{ wedge: string }>();
  const key = (Object.hasOwn(SOLUTIONS, wedge) ? wedge : "support") as SolutionKey;
  const page = SOLUTIONS[key];

  return (
    <MarketingPageFrame className="wl-solutions-page">
      <PageMeta
        title={`${page.title} | BotBound`}
        description={page.description}
        path={`/solutions/${key}`}
      />

      <section className="marketing-section marketing-section--screen">
        <div className="wl-public-rail">
          <div className="mx-auto flex max-w-3xl flex-col items-center justify-center text-center">
            <h1 className="marketing-hero-title mx-auto">{page.title}</h1>
            <p className="mx-auto mt-8 max-w-md text-lg leading-8 text-muted-foreground">
              Create a Bot. Add another whenever you want one.
            </p>
            <div className="marketing-hero__actions mt-10">
              <Link
                to={page.primary.href}
                className="marketing-btn-primary min-h-11 px-5 text-sm font-semibold"
              >
                Create a Bot
              </Link>
            </div>
          </div>
        </div>
      </section>
    </MarketingPageFrame>
  );
}
