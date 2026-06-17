import { Fragment } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, BookOpen, CalendarDays, Clock3 } from "lucide-react";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import { EmptyState } from "../components/ui/EmptyState";
import { BLOG_POSTS, getBlogPostBySlug } from "../data/blog-posts";
import { PageMeta } from "../lib/page-meta";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

function renderMarkdown(body: string) {
  return body
    .trim()
    .split(/\n\s*\n/)
    .map((block, index) => {
      const lines = block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length === 0) {
        return null;
      }

      if (lines[0].startsWith("# ")) {
        return null;
      }

      if (lines.every((line) => line.startsWith("- "))) {
        return (
          <ul key={index} className="space-y-3 pl-6 list-disc text-base sm:text-lg text-ink/80">
            {lines.map((line) => (
              <li key={line}>{line.replace(/^-\s+/, "")}</li>
            ))}
          </ul>
        );
      }

      if (lines[0].startsWith("## ")) {
        return (
          <h2 key={index} className="font-display italic text-3xl sm:text-4xl text-ink pt-3">
            {lines[0].replace(/^##\s+/, "")}
          </h2>
        );
      }

      if (lines[0].startsWith("### ")) {
        return (
          <h3 key={index} className="font-display italic text-2xl sm:text-3xl text-ink pt-2">
            {lines[0].replace(/^###\s+/, "")}
          </h3>
        );
      }

      return (
        <Fragment key={index}>
          <p className="text-base sm:text-lg leading-8 text-ink/80">{lines.join(" ")}</p>
        </Fragment>
      );
    });
}

export default function BlogPost() {
  const location = useLocation();
  const slug = location.pathname.replace(/^\/blog\//, "");
  const post = slug ? getBlogPostBySlug(slug) : undefined;
  const relatedPosts = BLOG_POSTS.filter((entry) => entry.id !== post?.id).slice(0, 3);

  if (!post) {
    return (
      <MarketingPageFrame mainClassName="!px-0 pt-20 sm:pt-24 pb-0">
        <PageMeta
          title="Post not found"
          description="The requested Wireline blog post could not be found."
          path="/blog"
          noIndex
        />
        <section className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 lg:px-10 pt-8 pb-24">
          <EmptyState
            icon={BookOpen}
            eyebrow="Wireline blog"
            title="That post isn't here anymore."
            description="The link may be outdated, or the article may have moved. Head back to the blog index to browse the latest essays."
            actions={[{ label: "Back to blog", to: "/blog", primary: true }]}
          />
        </section>
      </MarketingPageFrame>
    );
  }

  return (
    <>
      <PageMeta title={post.title} description={post.excerpt} path={`/blog/${post.id}`} />

      <MarketingPageFrame mainClassName="!px-0 pt-20 sm:pt-24 pb-0">
        <article className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-10 xl:px-14 pt-4 sm:pt-8 pb-18">
          <Link
            to="/blog"
            className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-brand hover:text-brand/80 transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to blog
          </Link>

          <header className="pb-10 border-b border-border">
            <p className="text-eyebrow text-brand mb-4">Wireline blog</p>
            <h1 className="marketing-hero-title mb-6 text-balance">{post.title}</h1>
            <p className="text-lg sm:text-xl text-ink/75 leading-relaxed max-w-3xl mb-6">
              {post.excerpt}
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink/60">
              <span>{post.author}</span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="w-4 h-4" />
                {dateFormatter.format(new Date(post.date))}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="w-4 h-4" />
                {post.readingTimeMinutes} min read
              </span>
            </div>
          </header>

          <div className="py-10 sm:py-12 space-y-6">{renderMarkdown(post.body)}</div>
        </article>

        <section className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 xl:px-14 pb-24">
          <div className="wl-panel border border-white/10 p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
              <div>
                <p className="text-[10px] uppercase tracking-[0.35em] text-brand/80 mb-2">
                  Keep reading
                </p>
                <h2 className="font-display italic text-3xl text-ink">More from the blog</h2>
              </div>
              <Link
                to="/blog"
                className="text-[11px] uppercase tracking-[0.3em] text-brand hover:text-brand/80 transition-colors"
              >
                View all posts
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {relatedPosts.map((entry) => (
                <article key={entry.id} className="border border-border bg-white/55 p-5">
                  <p className="text-xs text-ink/60 mb-2">
                    {dateFormatter.format(new Date(entry.date))}
                  </p>
                  <h3 className="font-display italic text-2xl text-ink mb-3 leading-tight">
                    {entry.title}
                  </h3>
                  <p className="text-sm text-ink/72 leading-relaxed mb-4">{entry.excerpt}</p>
                  <Link
                    to={`/blog/${entry.id}`}
                    className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-brand hover:text-brand/80 transition-colors"
                  >
                    Read post
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>
      </MarketingPageFrame>
    </>
  );
}
