import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, Clock3 } from "lucide-react";
import { motion } from "motion/react";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";
import { BLOG_POSTS } from "../data/blog-posts";
import { PageMeta } from "../lib/page-meta";
import { SectionHeader } from "../components/ui/SectionHeader";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

export default function Blog() {
  const featuredPost = BLOG_POSTS[0];
  const recentPosts = BLOG_POSTS.slice(1);

  return (
    <>
      <PageMeta
        title="Wireline Blog"
        description="Operator-first essays from Mike Lorenzo on voice AI performance, SMB automation, customer stories, and production lessons from building Wireline."
        path="/blog"
      />

      <MarketingPageFrame mainClassName="!px-0 pt-20 sm:pt-24 pb-0">
      <section className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 xl:px-14 pt-4 sm:pt-8 pb-12 sm:pb-16">
        <SectionHeader
          eyebrow="Wireline blog"
          title="Operator notes on voice AI, SMB growth, and what actually works in production."
          description="Essays from Mike Lorenzo on building fast, reliable voice agents, replacing brittle intake workflows, and helping small teams answer every customer like they have a full front desk behind them."
        />
      </section>

      <section className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 xl:px-14 pb-10">
        <motion.article
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55 }}
          className="border border-brand/20 p-6 sm:p-8 lg:p-10"
        >
          <SectionHeader
            eyebrow="Featured post"
            title={featuredPost.title}
            description={featuredPost.excerpt}
            className="mb-6"
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink/60 mb-4">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" />
              {dateFormatter.format(new Date(featuredPost.date))}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="w-3.5 h-3.5" />
              {featuredPost.readingTimeMinutes} min read
            </span>
            <span>{featuredPost.author}</span>
          </div>
          <Link
            to={`/blog/${featuredPost.id}`}
            className="marketing-btn-primary"
          >
            Read the post
            <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.article>
      </section>

        <section className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 xl:px-14 pb-24">
          <SectionHeader
            eyebrow="Recent essays"
            title="Latest posts"
            className="mb-8"
          />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
            {recentPosts.map((post, index) => (
              <motion.article
                key={post.id}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45, delay: index * 0.06 }}
                className="border border-ink/[0.08] p-5 sm:p-6 flex flex-col"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-ink/60 mb-4">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="w-3.5 h-3.5" />
                    {dateFormatter.format(new Date(post.date))}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock3 className="w-3.5 h-3.5" />
                    {post.readingTimeMinutes} min read
                  </span>
                </div>
                <h3 className="font-display italic text-2xl text-ink mb-3 leading-tight text-balance">
                  {post.title}
                </h3>
                <p className="text-sm text-ink/72 leading-relaxed flex-1">{post.excerpt}</p>
                <Link
                  to={`/blog/${post.id}`}
                  className="inline-flex items-center gap-2 mt-6 text-[11px] uppercase tracking-[0.3em] text-brand hover:text-brand/80 transition-colors"
                >
                  Read more
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </motion.article>
            ))}
          </div>
        </section>
      </MarketingPageFrame>
    </>
  );
}
