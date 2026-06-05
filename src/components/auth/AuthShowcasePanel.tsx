import { motion, useReducedMotion } from "motion/react";
import { Compass, Radio, Rocket, ChevronRight } from "lucide-react";
import { AUTH_PORTAL_SHOWCASE } from "../../lib/wireline-onboarding-copy";

const FEATURE_ICONS = {
  director: Compass,
  "live-ops": Radio,
  deploy: Rocket,
} as const;

export default function AuthShowcasePanel() {
  const reduceMotion = useReducedMotion();

  return (
    <motion.aside
      initial={reduceMotion ? false : { opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: reduceMotion ? 0 : 0.55,
        ease: [0.16, 1, 0.3, 1],
        delay: reduceMotion ? 0 : 0.08,
      }}
      className="wl-auth-showcase hidden lg:flex flex-col pr-10 min-w-0 max-w-[500px]"
      aria-label="Wireline product overview"
    >
      <div>
        <p className="wl-label text-brand mb-2">{AUTH_PORTAL_SHOWCASE.eyebrow}</p>
        <h2 className="font-display italic text-[clamp(1.75rem,3vw,2.35rem)] leading-[1.05] tracking-[-0.02em] text-ink text-balance">
          {AUTH_PORTAL_SHOWCASE.title}{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand to-brand-deep">
            {AUTH_PORTAL_SHOWCASE.titleAccent}
          </span>
        </h2>
        <p className="mt-3 text-[14px] leading-relaxed text-ink/65 max-w-md text-pretty">
          {AUTH_PORTAL_SHOWCASE.subtitle}
        </p>
      </div>

      <ul className="space-y-2.5 stagger-children">
        {AUTH_PORTAL_SHOWCASE.features.map((feature, i) => {
          const Icon = FEATURE_ICONS[feature.id as keyof typeof FEATURE_ICONS] ?? ChevronRight;
          return (
            <motion.li
              key={feature.id}
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: reduceMotion ? 0 : 0.15 + i * 0.08,
                duration: reduceMotion ? 0 : 0.4,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="wl-auth-showcase-feature"
            >
              <span className="wl-auth-showcase-icon" aria-hidden="true">
                <Icon className="w-4 h-4" strokeWidth={1.75} />
              </span>
              <div className="min-w-0">
                <p className="wl-label text-ink">{feature.label}</p>
                <p className="text-[12px] text-muted leading-relaxed mt-0.5">{feature.detail}</p>
              </div>
            </motion.li>
          );
        })}
      </ul>
    </motion.aside>
  );
}
