import React from "react";
import { motion } from "motion/react";

/**
 * Compact monochrome SVG logos for partners + integrations we ship.
 * Rendered as a horizontal trust strip on the AuthPortal — meant to
 * communicate "battle-tested stack" without being a noisy marketing
 * banner.
 *
 * All logos are rendered in `currentColor` so they inherit the muted
 * text color and don't fight the aurora background. They lighten on
 * hover to subtly invite the eye.
 *
 * SVG paths sourced from publicly-available brand asset kits (each
 * vendor's official brand page) and simplified to single-color form.
 * Where official assets weren't usable mono, we used Simple Icons
 * (CC0 license).
 */

type LogoDef = {
  name: string;
  svg: React.ReactNode;
  /** Some marks are visually heavier; let the component re-weight per logo. */
  scale?: number;
};

const LOGOS: LogoDef[] = [
  {
    name: "Anthropic",
    svg: (
      <svg viewBox="0 0 256 176" fill="currentColor" aria-label="Anthropic">
        <path d="M147.42 0h44.34l63.5 176h-44.34l-12.99-37.07h-65.5L119.43 176H75.09Zm-2.49 105.07h36.81l-18.4-52.45ZM0 176 63.5 0h44.34l-63.5 176Z" />
      </svg>
    ),
  },
  {
    name: "OpenAI",
    svg: (
      <svg viewBox="0 0 256 260" fill="currentColor" aria-label="OpenAI">
        <path d="M239.2 106.5a64.5 64.5 0 0 0-5.6-53.1A65.3 65.3 0 0 0 163 22a64.5 64.5 0 0 0-49-22 65.4 65.4 0 0 0-62.4 45.4 64.6 64.6 0 0 0-43.2 31.4 65.4 65.4 0 0 0 8.1 76.6 64.5 64.5 0 0 0 5.6 53.1A65.4 65.4 0 0 0 93 238a64.5 64.5 0 0 0 49 22 65.4 65.4 0 0 0 62.4-45.4 64.6 64.6 0 0 0 43.2-31.4 65.4 65.4 0 0 0-8.4-76.7Zm-97.3 136a48.4 48.4 0 0 1-31.1-11.3l1.5-.9 51.7-29.8a8.4 8.4 0 0 0 4.3-7.4v-72.8l21.9 12.6c.2.1.4.3.4.6V194a48.5 48.5 0 0 1-48.7 48.5Zm-104.2-44.5a48.3 48.3 0 0 1-5.8-32.5l1.6.9 51.7 29.8a8.4 8.4 0 0 0 8.4 0l63.2-36.4v25.3a.7.7 0 0 1-.3.6L104 215.7a48.6 48.6 0 0 1-66.3-17.7ZM24 97.8a48.3 48.3 0 0 1 25.2-21.3v60a8.4 8.4 0 0 0 4.2 7.3l62.8 36.3-21.9 12.7a.8.8 0 0 1-.7 0L41.4 163A48.5 48.5 0 0 1 24 97.8Zm179.6 41.8L140.9 103l21.8-12.6a.8.8 0 0 1 .8 0l52.2 30.2a48.5 48.5 0 0 1-7.4 87.5v-60a8.5 8.5 0 0 0-4.7-7.5Zm21.7-32.6-1.5-1-51.6-30a8.4 8.4 0 0 0-8.5 0L100.6 112V86.7a.7.7 0 0 1 .3-.6L153 56a48.5 48.5 0 0 1 72.2 50.4Zm-137 44.6-21.9-12.6a.8.8 0 0 1-.4-.6V69a48.5 48.5 0 0 1 79.6-37.2l-1.5.8L92.3 62.5a8.4 8.4 0 0 0-4.2 7.3v72.7Zm11.9-25.6L128 110l28 16v32l-28 16-28-16Z" />
      </svg>
    ),
  },
  {
    name: "Google",
    svg: (
      <svg viewBox="0 0 256 262" aria-label="Google">
        <path
          fill="currentColor"
          opacity="0.75"
          d="M255.9 133.5c0-10.6-1-18.1-3-25.9H130.5v46.9h71.8c-1.4 11.7-9.2 29.4-26.5 41.2l-.2 1.6 38.4 29.8 2.6.3c24.5-22.6 38.6-56 38.6-93.9"
        />
        <path
          fill="currentColor"
          d="M130.5 261.1c35 0 64.4-11.5 85.8-31.4l-40.9-31.7c-10.9 7.6-25.6 13-44.9 13a78 78 0 0 1-73.7-53.9l-1.5.1-39.9 30.9-.5 1.4c21.3 42.4 65.1 71.6 115.6 71.6"
        />
        <path
          fill="currentColor"
          opacity="0.5"
          d="M56.8 157a78 78 0 0 1-4.2-25c0-8.7 1.5-17.1 4-25l-.1-1.7-40.4-31.4-1.3.6a131 131 0 0 0-14 57.5 131 131 0 0 0 14 57.5l41.9-32.5"
        />
        <path
          fill="currentColor"
          d="M130.5 53.4c25 0 41.8 10.8 51.4 19.8l37.5-36.6C196.4 14.1 165.5 0 130.5 0 80 0 36.2 29.2 14.9 71.6l41.8 32.4a78.4 78.4 0 0 1 73.8-50.6"
        />
      </svg>
    ),
  },
  {
    name: "Microsoft",
    svg: (
      <svg viewBox="0 0 24 24" aria-label="Microsoft">
        <path
          fill="currentColor"
          d="M11.4 11.4H0V0h11.4v11.4Zm0 12.6H0V12.6h11.4V24ZM24 11.4H12.6V0H24v11.4Zm0 12.6H12.6V12.6H24V24Z"
        />
      </svg>
    ),
  },
  {
    name: "Stripe",
    svg: (
      <svg viewBox="0 0 60 25" fill="currentColor" aria-label="Stripe">
        <path d="M59.6 14.1c0-4.4-2.2-7.9-6.3-7.9-4.2 0-6.7 3.5-6.7 7.8 0 5.1 2.9 7.7 7.2 7.7 2.1 0 3.7-.5 4.9-1.1v-3.4c-1.2.6-2.6 1-4.3 1-1.7 0-3.2-.6-3.4-2.7H59.5c0-.2.1-.9.1-1.4Zm-8.7-1.6c0-2 1.3-2.9 2.4-2.9 1.2 0 2.4.9 2.4 2.9h-4.8Zm-11.2-6.3c-1.7 0-2.8.8-3.4 1.4l-.2-1.1H32V26l4.1-.9v-4.9c.6.4 1.5 1 2.9 1 3 0 5.7-2.4 5.7-7.8 0-5-2.7-7.2-5.7-7.2Zm-1 11.1c-1 0-1.5-.4-1.9-.8V10.7c.4-.4 1-.8 1.9-.8 1.4 0 2.4 1.6 2.4 3.7 0 2.2-1 3.7-2.4 3.7ZM26.4 5.3v-3l-4.1.9v3.3l4.1-1.2Zm0 1.2h-4.1v14.7h4.1V6.5ZM18 7.7l-.3-1.2h-3.5v14.7h4.1v-9.9c1-1.3 2.6-1 3.1-.9V6.5c-.5-.2-2.4-.5-3.4 1.2Zm-7.6-5.4-4 .9v13.1c0 2.4 1.8 4.2 4.2 4.2 1.3 0 2.3-.2 2.9-.5v-3.3c-.5.2-3.1 1-3.1-1.4v-6h3.1V5.7h-3.1V2.3ZM3.4 11c0-.7.5-1 1.4-1 1.2 0 2.8.4 4 1.1v-3.9c-1.3-.5-2.7-.7-4-.7C1.4 6.5 0 8.2 0 11c0 4.4 5.9 3.7 5.9 5.5 0 .8-.6 1-1.6 1-1.3 0-3-.5-4.3-1.3v3.9a11 11 0 0 0 4.3.9c3.5 0 4.9-1.7 4.9-4.4 0-4.7-6-3.9-6-5.6Z" />
      </svg>
    ),
  },
  {
    name: "Twilio",
    svg: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-label="Twilio">
        <path d="M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24Zm0 21.4A9.4 9.4 0 0 1 2.6 12 9.4 9.4 0 0 1 12 2.6 9.4 9.4 0 0 1 21.4 12 9.4 9.4 0 0 1 12 21.4ZM17.5 9.1a2.4 2.4 0 1 1-4.8 0 2.4 2.4 0 0 1 4.8 0Zm0 5.8a2.4 2.4 0 1 1-4.8 0 2.4 2.4 0 0 1 4.8 0Zm-6.2-5.8a2.4 2.4 0 1 1-4.8 0 2.4 2.4 0 0 1 4.8 0Zm0 5.8a2.4 2.4 0 1 1-4.8 0 2.4 2.4 0 0 1 4.8 0Z" />
      </svg>
    ),
  },
  {
    name: "Slack",
    svg: (
      <svg viewBox="0 0 24 24" aria-label="Slack">
        <path
          fill="currentColor"
          d="M5.04 15.16a2.52 2.52 0 1 1-2.52-2.52h2.52v2.52Zm1.27 0a2.52 2.52 0 1 1 5.05 0v6.32a2.52 2.52 0 1 1-5.05 0v-6.32Zm2.52-10.12a2.52 2.52 0 1 1 2.52-2.52v2.52H8.83Zm0 1.28a2.52 2.52 0 1 1 0 5.04H2.52a2.52 2.52 0 1 1 0-5.04h6.31Zm10.13 2.52a2.52 2.52 0 1 1 2.52 2.52h-2.52V8.84Zm-1.27 0a2.52 2.52 0 1 1-5.04 0V2.52a2.52 2.52 0 1 1 5.04 0v6.32Zm-2.52 10.12a2.52 2.52 0 1 1-2.52 2.52v-2.52h2.52Zm0-1.28a2.52 2.52 0 1 1 0-5.04h6.31a2.52 2.52 0 1 1 0 5.04h-6.31Z"
        />
      </svg>
    ),
  },
  {
    name: "Meta",
    svg: (
      <svg viewBox="0 0 36 24" fill="currentColor" aria-label="Meta">
        <path d="M20.3 12c0-3.7 1.7-6.2 3.8-6.2 1.9 0 3.4 1.9 3.7 5l-1.8.4c-.2-1.9-.9-3-1.9-3-1 0-1.7 1.3-1.7 3.8 0 2.4.7 3.8 1.7 3.8.9 0 1.5-.8 1.9-2.6l1.8.4c-.5 3.4-1.8 4.6-3.7 4.6-2.1 0-3.8-2.5-3.8-6.2Zm-9.2 0c0 3.7 1.7 6.2 3.8 6.2 1.9 0 3.4-1.9 3.7-5l-1.8-.4c-.2 1.9-.9 3-1.9 3-1 0-1.7-1.3-1.7-3.8 0-2.4.7-3.8 1.7-3.8.9 0 1.5.8 1.9 2.6l1.8-.4c-.5-3.4-1.8-4.6-3.7-4.6-2.1 0-3.8 2.5-3.8 6.2Zm-7.5 6h2.2L7.3 8.2 9.9 18h2.2L8.7 6h-2.6Zm26.2-12c-3.4 0-4.8 4.3-4.8 6 0 2 1.4 6 4.8 6 3.5 0 4.8-4 4.8-6 0-1.7-1.3-6-4.8-6Z" />
      </svg>
    ),
  },
  {
    name: "Supabase",
    svg: (
      <svg viewBox="0 0 109 113" fill="currentColor" aria-label="Supabase">
        <path d="M63.7 110.3c-2.8 3.6-8.7 1.6-8.6-3l1-69h47c8.6 0 13.3 9.8 8 16.5l-47.4 55.5Z" />
        <path d="M45.3 2.6c2.9-3.6 8.7-1.6 8.7 3l-.4 69H7.1c-8.5 0-13.3-9.8-8-16.5L45.3 2.6Z" />
      </svg>
    ),
  },
  {
    name: "Vercel",
    svg: (
      <svg viewBox="0 0 226 200" fill="currentColor" aria-label="Vercel">
        <path d="M113 0 226 200H0Z" />
      </svg>
    ),
  },
  {
    name: "ElevenLabs",
    svg: (
      <svg viewBox="0 0 100 100" fill="currentColor" aria-label="ElevenLabs">
        <rect x="22" y="12" width="22" height="76" rx="2" />
        <rect x="56" y="12" width="22" height="76" rx="2" />
      </svg>
    ),
    scale: 0.95,
  },
];

export default function IntegrationLogos() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.45, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      className="mt-10 pt-8 border-t border-white/8"
      aria-label="Wireline runs on and integrates with"
    >
      <p className="text-[8px] uppercase tracking-[0.5em] text-muted/55 mb-4 text-center">
        Built on · integrates with
      </p>
      <div className="flex items-center justify-center flex-wrap gap-x-7 gap-y-4 opacity-70 hover:opacity-100 transition-opacity">
        {LOGOS.map((logo) => (
          <div
            key={logo.name}
            className="text-ink/55 hover:text-ink transition-colors"
            title={logo.name}
            style={{
              height: 18,
              transform: logo.scale ? `scale(${logo.scale})` : undefined,
            }}
          >
            <div className="h-[18px] w-auto inline-flex items-center">
              {React.cloneElement(logo.svg as React.ReactElement, {
                style: { height: "100%", width: "auto", display: "block" },
              })}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
