/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import React from "react";

/**
 * Compact monochrome SVG logos for integrations and partners we ship.
 * Used via getIntegrationLogo() on connection cards and operating maps.
 * All logos render in `currentColor` so they inherit the muted text color.
 * Sourced from official asset kits and simplified to single-color form.
 */

type LogoDef = {
  name: string;
  svg: React.ReactNode;
  scale?: number;
};

const ALL_LOGOS: Record<string, LogoDef> = {
  hubspot: {
    name: "HubSpot",
    svg: (
      <svg viewBox="0 0 32 32" aria-label="HubSpot" width="100%" height="100%">
        <path d="M23 10.6V6.4a2.4 2.4 0 1 0-3.2 0v4.2a8 8 0 0 0-3.6 1.3L5.8 4.1l.4-1.3a3 3 0 1 0-2.2 1.4l9.6 7.5a8 8 0 1 0 12.4 4 8 8 0 0 0-3-5Zm-1.6 12.4a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9Z" />
      </svg>
    ),
  },
  salesforce: {
    name: "Salesforce",
    svg: (
      <svg viewBox="0 0 100 70" aria-label="Salesforce" width="100%" height="100%">
        <path d="M42 14a16 16 0 0 1 28 6 13 13 0 0 1 19 14 14 14 0 0 1-9 13 14 14 0 0 1-26 4 16 16 0 0 1-25-3 12 12 0 0 1-2-23 16 16 0 0 1 15-11Z" />
      </svg>
    ),
    scale: 1.1,
  },
  shopify: {
    name: "Shopify",
    svg: (
      <svg viewBox="0 0 24 24" aria-label="Shopify" width="100%" height="100%">
        <path d="M19.782 5.86a.855.855 0 00-.766-.46H16.03V4.4c0-1.1-.9-2-2-2h-4.06c-1.1 0-2 .9-2 2v1H5.405c-.322 0-.616.182-.766.47L1.139 12.83a.853.853 0 00.117.962L5.8 19.345a.852.852 0 00.65.295h11.1c.258 0 .5-.119.65-.325l4.545-5.918a.853.853 0 00.117-.962L19.782 5.86zm-10.812-1.46c0-.55.45-1 1-1h4.06c.55 0 1 .45 1 1v1h-6.06v-1zm-.565 14.145L4.472 13.9l2.766-4.52a.85.85 0 011.082-.361l3.525 1.76a.85.85 0 001.082-.361l2.766-4.52 3.933 4.645-11.22 8.002z" />
      </svg>
    ),
  },
  square: {
    name: "Square",
    svg: (
      <svg viewBox="0 0 24 24" aria-label="Square" width="100%" height="100%">
        <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-1 15H6V6h12v12zm-3-3H9V9h6v6z" />
      </svg>
    ),
  },
  docusign: {
    name: "DocuSign",
    svg: (
      <svg viewBox="0 0 24 24" aria-label="DocuSign" width="100%" height="100%">
        <path d="M10.155 0L7.132 5.234 13.91 17h6.046L10.155 0zm6.713 0L6.712 17.436h6.046L22.915 0h-6.046zM3.823 11.724L0 18.347h6.047l3.822-6.623H3.823z" />
      </svg>
    ),
  },
  slack: {
    name: "Slack",
    svg: (
      <svg viewBox="0 0 24 24" aria-label="Slack" width="100%" height="100%">
        <path d="M5.04 15.16a2.52 2.52 0 1 1-2.52-2.52h2.52v2.52Zm1.27 0a2.52 2.52 0 1 1 5.05 0v6.32a2.52 2.52 0 1 1-5.05 0v-6.32Zm2.52-10.12a2.52 2.52 0 1 1 2.52-2.52v2.52H8.83Zm0 1.28a2.52 2.52 0 1 1 0 5.04H2.52a2.52 2.52 0 1 1 0-5.04h6.31Zm10.13 2.52a2.52 2.52 0 1 1 2.52 2.52h-2.52V8.84Zm-1.27 0a2.52 2.52 0 1 1-5.04 0V2.52a2.52 2.52 0 1 1 5.04 0v6.32Zm-2.52 10.12a2.52 2.52 0 1 1-2.52 2.52v-2.52h2.52Zm0-1.28a2.52 2.52 0 1 1 0-5.04h6.31a2.52 2.52 0 1 1 0 5.04h-6.31Z" />
      </svg>
    ),
  },
  x: {
    name: "X",
    svg: (
      <svg viewBox="0 0 24 24" aria-label="X" width="100%" height="100%">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  microsoft_teams: {
    name: "Microsoft Teams",
    svg: (
      <svg viewBox="0 0 24 24" aria-label="Microsoft Teams" width="100%" height="100%">
        <path d="M10 2a3 3 0 013 3v2a3 3 0 01-3 3H7a3 3 0 01-3-3V5a3 3 0 013-3h3zm8 3a2.5 2.5 0 012.5 2.5v1.5A2.5 2.5 0 0118 11.5h-2.5a2.5 2.5 0 01-2.5-2.5v-1.5A2.5 2.5 0 0115.5 5H18zm-8 7c3.31 0 6 2.69 6 6v3H4v-3c0-3.31 2.69-6 6-6zm8 2c2.21 0 4 1.79 4 4v2h-8v-2c0-2.21 1.79-4 4-4z" />
      </svg>
    ),
  },
  twilio: {
    name: "Twilio",
    svg: (
      <svg viewBox="0 0 24 24" aria-label="Twilio" width="100%" height="100%">
        <path d="M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24Zm0 21.4A9.4 9.4 0 0 1 2.6 12 9.4 9.4 0 0 1 12 2.6 9.4 9.4 0 0 1 21.4 12 9.4 9.4 0 0 1 12 21.4ZM17.5 9.1a2.4 2.4 0 1 1-4.8 0 2.4 2.4 0 0 1 4.8 0Zm0 5.8a2.4 2.4 0 1 1-4.8 0 2.4 2.4 0 0 1 4.8 0Zm-6.2-5.8a2.4 2.4 0 1 1-4.8 0 2.4 2.4 0 0 1 4.8 0Zm0 5.8a2.4 2.4 0 1 1-4.8 0 2.4 2.4 0 0 1 4.8 0Z" />
      </svg>
    ),
  },
  zoom: {
    name: "Zoom",
    svg: (
      <svg viewBox="0 0 24 24" aria-label="Zoom" width="100%" height="100%">
        <path d="M21 7.156l-3.5 2.625V8.5c0-1.1-.9-2-2-2H3c-1.1 0-2 .9-2 2v7c0 1.1.9 2 2 2h12.5c1.1 0 2-.9 2-2v-1.281l3.5 2.625a.5.5 0 0 0 .5-.4V7.556a.5.5 0 0 0-.5-.4z" />
      </svg>
    ),
    scale: 1.15,
  },
  google_calendar: {
    name: "Google Calendar",
    svg: (
      <svg viewBox="0 0 24 24" aria-label="Google Calendar" width="100%" height="100%">
        <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11zM7 11h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2zm-8 4h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z" />
      </svg>
    ),
  },
  microsoft_outlook: {
    name: "Microsoft Outlook",
    svg: (
      <svg viewBox="0 0 24 24" aria-label="Microsoft Outlook" width="100%" height="100%">
        <path d="M21 5H9.5c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H21c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zM4.5 7h1.5v10H4.5c-1.38 0-2.5-1.12-2.5-2.5V9.5C2 8.12 3.12 7 4.5 7zM11 9.5l3.5 2.188L18 9.5v5l-3.5 2.188L11 14.5v-5z" />
      </svg>
    ),
  },
  gmail: {
    name: "Gmail",
    svg: (
      <svg viewBox="0 0 24 24" aria-label="Gmail" width="100%" height="100%">
        <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-.4 2.5L12 11.2 4.4 6.5h15.2zM4 18V8.3l8 5 8-5V18H4z" />
      </svg>
    ),
  },
  meta: {
    name: "Meta",
    svg: (
      <svg viewBox="0 0 24 24" aria-label="Meta" width="100%" height="100%">
        <path d="M16.5 6C14.43 6 12.63 7.37 12 9.27c-.63-1.9-2.43-3.27-4.5-3.27C4.46 6 2 8.46 2 11.5S4.46 17 7.5 17c2.07 0 3.87-1.37 4.5-3.27.63 1.9 2.43 3.27 4.5 3.27 3.04 0 5.5-2.46 5.5-5.5S19.54 6 16.5 6zm-9 9C5.57 15 4 13.43 4 11.5S5.57 8 7.5 8c1.55 0 2.87 1.01 3.35 2.43A3.5 3.5 0 0 1 7.5 15zm9 0c-1.55 0-2.87-1.01-3.35-2.43A3.5 3.5 0 0 1 16.5 15c1.93 0 3.5-1.57 3.5-3.5S18.43 8 16.5 8c-1.93 0-3.5 1.57-3.5 3.5 0 1.93 1.57 3.5 3.5 3.5z" />
      </svg>
    ),
  },
  apollo: {
    name: "Apollo",
    svg: (
      <svg viewBox="0 0 24 24" aria-label="Apollo" width="100%" height="100%">
        <path d="M12 2s-5 4.5-5 9c0 2.76 2.24 5 5 5s5-2.24 5-9c0-4.5-5-4.5-5-4.5zm0 11.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5zm0 3.5c-3.31 0-6 2.69-6 6h12c0-3.31-2.69-6-6-6z" />
      </svg>
    ),
  },
  google_sheets: {
    name: "Google Sheets",
    svg: (
      <svg viewBox="0 0 24 24" aria-label="Google Sheets" width="100%" height="100%">
        <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V7h14v12zm-8-9h7v3h-7v-3zm0 4h7v3h-7v-3zM6 10h4v3H6v-3zm0 4h4v3H6v-3z" />
      </svg>
    ),
  },
  microsoft_excel: {
    name: "Microsoft Excel",
    svg: (
      <svg viewBox="0 0 24 24" aria-label="Microsoft Excel" width="100%" height="100%">
        <path d="M19.5 3h-15C3.67 3 3 3.67 3 4.5v15c0 .83.67 1.5 1.5 1.5h15c.83 0 1.5-.67 1.5-1.5v-15c0-.83-.67-1.5-1.5-1.5zm-8.25 12h-1.5l-1.5-2.5L6.75 15h-1.5l2.25-3.5L5.25 8h1.5l1.5 2.5L9.75 8h1.5l-2.25 3.5L11.25 15zm7.5 0h-6v-1.5h6V15zm0-3.5h-6v-1.5h6v1.5zm0-3.5h-6V6.5h6V8z" />
      </svg>
    ),
  },
  // Backward compatibility keys (still accessible via getIntegrationLogo):
  google: {
    name: "Google",
    svg: (
      <svg viewBox="0 0 256 262" aria-label="Google" width="100%" height="100%">
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
  microsoft: {
    name: "Microsoft",
    svg: (
      <svg viewBox="0 0 24 24" aria-label="Microsoft" width="100%" height="100%">
        <path
          fill="currentColor"
          d="M11.4 11.4H0V0h11.4v11.4Zm0 12.6H0V12.6h11.4V24ZM24 11.4H12.6V0H24v11.4Zm0 12.6H12.6V12.6H24V24Z"
        />
      </svg>
    ),
  },
  yahoo: {
    name: "Yahoo",
    svg: (
      <svg viewBox="0 0 100 100" aria-label="Yahoo" width="100%" height="100%">
        <path
          fill="currentColor"
          d="M11 28h13l8 21 8-21h13L37 65v17H24V65L11 28Zm56 0h13l-9 28-4-12 5-16h-5Zm-7 33a7 7 0 1 1 0 14 7 7 0 0 1 0-14Z"
        />
      </svg>
    ),
  },
  icloud: {
    name: "iCloud",
    svg: (
      <svg viewBox="0 0 24 24" aria-label="iCloud" width="100%" height="100%">
        <path
          fill="currentColor"
          d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96Z"
        />
      </svg>
    ),
  },
  agentmail: {
    name: "AgentMail",
    svg: (
      <svg viewBox="0 0 24 24" aria-label="AgentMail" width="100%" height="100%">
        <path
          fill="currentColor"
          d="M3 6.75A2.75 2.75 0 0 1 5.75 4h12.5A2.75 2.75 0 0 1 21 6.75v10.5A2.75 2.75 0 0 1 18.25 20H5.75A2.75 2.75 0 0 1 3 17.25V6.75Zm2.2.5 6.3 4.2c.3.2.7.2 1 0l6.3-4.2a.75.75 0 0 0-.8-1.27L12 10.05 6 6.48a.75.75 0 1 0-.8 1.27Z"
        />
      </svg>
    ),
  },
  stripe: {
    name: "Stripe",
    svg: (
      <svg viewBox="0 0 60 25" aria-label="Stripe" width="100%" height="100%">
        <path
          fill="currentColor"
          d="M59.6 14.1c0-4.4-2.2-7.9-6.3-7.9-4.2 0-6.7 3.5-6.7 7.8 0 5.1 2.9 7.7 7.2 7.7 2.1 0 3.7-.5 4.9-1.1v-3.4c-1.2.6-2.6 1-4.3 1-1.7 0-3.2-.6-3.4-2.7H59.5c0-.2.1-.9.1-1.4Zm-8.7-1.6c0-2 1.3-2.9 2.4-2.9 1.2 0 2.4.9 2.4 2.9h-4.8Zm-11.2-6.3c-1.7 0-2.8.8-3.4 1.4l-.2-1.1H32V26l4.1-.9v-4.9c.6.4 1.5 1 2.9 1 3 0 5.7-2.4 5.7-7.8 0-5-2.7-7.2-5.7-7.2Zm-1 11.1c-1 0-1.5-.4-1.9-.8V10.7c.4-.4 1-.8 1.9-.8 1.4 0 2.4 1.6 2.4 3.7 0 2.2-1 3.7-2.4 3.7ZM26.4 5.3v-3l-4.1.9v3.3l4.1-1.2Zm0 1.2h-4.1v14.7h4.1V6.5ZM18 7.7l-.3-1.2h-3.5v14.7h4.1v-9.9c1-1.3 2.6-1 3.1-.9V6.5c-.5-.2-2.4-.5-3.4 1.2Zm-7.6-5.4-4 .9v13.1c0 2.4 1.8 4.2 4.2 4.2 1.3 0 2.3-.2 2.9-.5v-3.3c-.5.2-3.1 1-3.1-1.4v-6h3.1V5.7h-3.1V2.3ZM3.4 11c0-.7.5-1 1.4-1 1.2 0 2.8.4 4 1.1v-3.9c-1.3-.5-2.7-.7-4-.7C1.4 6.5 0 8.2 0 11c0 4.4 5.9 3.7 5.9 5.5 0 .8-.6 1-1.6 1-1.3 0-3-.5-4.3-1.3v3.9a11 11 0 0 0 4.3.9c3.5 0 4.9-1.7 4.9-4.4 0-4.7-6-3.9-6-5.6Z"
        />
      </svg>
    ),
  },
  // Cloud & AI partners:
  xai: {
    name: "xAI",
    svg: (
      <svg viewBox="0 0 48 24" aria-label="xAI" width="100%" height="100%">
        <text
          x="2"
          y="16"
          fontFamily="Inter, Arial, sans-serif"
          fontSize="13"
          fontWeight="650"
          letterSpacing="0"
        >
          xAI
        </text>
      </svg>
    ),
  },
  openai: {
    name: "OpenAI",
    svg: (
      <svg viewBox="0 0 64 24" aria-label="OpenAI" width="100%" height="100%">
        <text
          x="2"
          y="16"
          fontFamily="Inter, Arial, sans-serif"
          fontSize="13"
          fontWeight="650"
          letterSpacing="0"
        >
          OpenAI
        </text>
      </svg>
    ),
  },
  gemini: {
    name: "Gemini",
    svg: (
      <svg viewBox="0 0 24 24" aria-label="Gemini" width="100%" height="100%">
        <path d="M12 2Q12 12 22 12Q12 12 12 22Q12 12 2 12Q12 12 12 2Z" />
      </svg>
    ),
  },
  vapi: {
    name: "Vapi",
    svg: (
      <svg viewBox="0 0 24 24" aria-label="Vapi" width="100%" height="100%">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-5 11h2v-2H7v2zm4 3h2V8h-2v8zm4-5v2h2v-2h-2z" />
      </svg>
    ),
  },
  supabase: {
    name: "Supabase",
    svg: (
      <svg viewBox="0 0 24 24" aria-label="Supabase" width="100%" height="100%">
        <path d="M21.4 11.6l-8.3-9.3c-.4-.4-1.1-.1-1.1.5v6.2H4.6c-.6 0-1 .6-.6 1.1l8.3 9.3c.4.4 1.1.1 1.1-.5v-6.2h7.4c.6 0 1-.6.6-1.1z" />
      </svg>
    ),
  },
  vercel: {
    name: "Vercel",
    svg: (
      <svg viewBox="0 0 24 24" aria-label="Vercel" width="100%" height="100%">
        <path d="M12 2L2 22h20L12 2z" />
      </svg>
    ),
  },
};

export function getIntegrationLogo(name: string): React.ReactNode | null {
  const normName = name.toLowerCase().replace(/\s+/g, "_");
  const logo = ALL_LOGOS[normName] || ALL_LOGOS[name.toLowerCase()];
  if (!logo) return null;
  return React.cloneElement(logo.svg as React.ReactElement<any>, {
    style: { height: "100%", width: "auto", display: "block", fill: "currentColor" },
  });
}
