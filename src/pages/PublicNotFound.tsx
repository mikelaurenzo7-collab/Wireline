import MarketingChrome from "../components/marketing/MarketingChrome";
import NotFound from "../components/layout/NotFound";
import { PageMeta } from "../lib/page-meta";

/** Public, no-index 404 with the same chrome and Letterpress language as marketing. */
export default function PublicNotFound() {
  return (
    <>
      <PageMeta
        title="Page not found | Wireline"
        description="That Wireline page could not be found."
        path="/404"
        noIndex
      />
      <MarketingChrome stickyCta={false}>
        <NotFound mode="public" />
      </MarketingChrome>
    </>
  );
}
