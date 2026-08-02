import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");
const failures = [];
const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const index = read("index.html");
const loader = read("public/marketing-measurement.js");
const notice = read("src/components/CookieConsent.tsx");
const privacyPage = read("src/components/PrivacyPolicyPage.tsx");
const app = read("src/App.tsx");
const footer = read("src/components/marketing/MarketingFooter.tsx");
const csp = read("src/lib/csp.ts");
const vercelSource = read("vercel.json");

let vercel;
try {
  vercel = JSON.parse(vercelSource);
} catch (error) {
  failures.push(
    `vercel.json must remain valid JSON: ${error instanceof Error ? error.message : error}`,
  );
}

const consentKey = "wireline_marketing_measurement_consent";
const consentEvent = "wireline:marketing-measurement-consent";
const privacyChoicesEvent = "wireline:open-privacy-choices";
const removedInlineMetaHash = "sha256-wlyqsbOPnONv6AM5ziYNY+cA6vvH4mU1oRX7hBcx9HQ=";
const retiredAnalyticsHosts = [
  "googletagmanager.com",
  "google-analytics.com",
  "analytics.google.com",
  "stats.g.doubleclick.net",
];

assert(
  index.includes('<script defer src="/marketing-measurement.js"></script>'),
  "index.html must load the same-origin consent-aware measurement runtime.",
);
assert(
  !index.includes("connect.facebook.net/en_US/fbevents.js"),
  "index.html must not load Meta directly before a visitor choice.",
);
assert(
  !index.includes('fbq("track", "PageView")'),
  "index.html must not emit an unconditional Meta PageView.",
);

assert(loader.includes(consentKey), "measurement loader must read the canonical consent key.");
assert(
  loader.includes(consentEvent),
  "measurement loader must listen for the canonical consent event.",
);
assert(
  loader.includes('readConsent() !== "granted"'),
  "measurement loader must default off without an explicit grant.",
);
assert(
  loader.includes("navigator.globalPrivacyControl === true"),
  "measurement loader must honor Global Privacy Control.",
);
assert(
  loader.includes('client("consent", "revoke")'),
  "measurement loader must revoke Meta consent when a visitor opts out.",
);
assert(
  loader.includes('window.fbq("consent", "grant")'),
  "measurement loader must grant Meta consent only after an explicit choice.",
);
assert(
  loader.includes('window.fbq("track", "PageView")'),
  "measurement loader must preserve post-consent campaign attribution.",
);
assert(
  loader.includes("window.__wirelineMarketingMeasurementEnabled = false"),
  "measurement revocation must update the runtime state.",
);
assert(
  loader.includes("window.fbq = noop") && loader.includes("window._fbq = noop"),
  "measurement revocation must stop future Wireline-triggered Meta events.",
);
assert(
  loader.includes('event.detail === "granted"') &&
    loader.includes("disableMarketingMeasurement();"),
  "measurement consent events must support both grant and revocation.",
);

assert(notice.includes(consentKey), "privacy notice must write the canonical consent key.");
assert(notice.includes(consentEvent), "privacy notice must dispatch the canonical consent event.");
assert(
  notice.includes(privacyChoicesEvent),
  "privacy notice must support reopening saved choices.",
);
assert(
  footer.includes(privacyChoicesEvent),
  "public footer must expose the privacy choice control.",
);
assert(footer.includes("Privacy choices"), "public footer must label the privacy choice control.");
assert(notice.includes("Essential only"), "privacy notice must offer a privacy-preserving choice.");
assert(notice.includes("Allow measurement"), "privacy notice must offer explicit opt-in.");
assert(
  notice.includes("function noticeAcknowledged(): boolean"),
  "privacy notice must isolate the stored-choice lookup behind a fail-safe helper.",
);
assert(
  notice.includes("localStorage.getItem(NOTICE_STORAGE_KEY) !== null"),
  "privacy notice must read acknowledgement through the guarded helper.",
);
assert(
  notice.includes("Hardened/private contexts may block storage entirely"),
  "privacy notice must document its storage-unavailable fail-safe.",
);
assert(
  !notice.includes("if (localStorage.getItem(NOTICE_STORAGE_KEY)) return;"),
  "privacy notice must not perform an unguarded initial storage read.",
);
assert(
  notice.includes("window.addEventListener(OPEN_PRIVACY_CHOICES_EVENT, openPrivacyChoices)"),
  "privacy notice must respond to the persistent privacy-choice control.",
);
assert(
  !notice.includes("no ad or cross-site tracking"),
  "privacy notice must not make the old claim while optional measurement exists.",
);

assert(
  app.includes('import CookieConsent from "./components/CookieConsent";') &&
    app.includes("<CookieConsent />"),
  "the consent notice must actually be MOUNTED in App.tsx — asserting only the component's contents let the banner sit unmounted while every content check passed (footer 'Privacy choices' dispatched to no listener; visitors never saw a consent choice).",
);
assert(
  app.includes('const PrivacyPolicy = lazy(() => import("./components/PrivacyPolicyPage"));'),
  "the public /privacy route must use the consent-aware privacy policy.",
);
assert(
  app.includes('<Route path="/privacy" element={<PrivacyPolicy />} />'),
  "the public privacy route must remain registered.",
);
assert(privacyPage.includes(consentKey), "privacy center must persist the canonical consent key.");
assert(
  privacyPage.includes(consentEvent),
  "privacy center must dispatch the canonical consent event.",
);
assert(
  privacyPage.includes("Keep measurement off") && privacyPage.includes("Allow measurement"),
  "privacy policy must disclose and control optional advertising measurement.",
);
assert(
  privacyPage.includes("Global Privacy Control") &&
    privacyPage.includes("We do not sell personal information."),
  "privacy policy must disclose the privacy signal and no-sale posture.",
);
assert(
  privacyPage.includes("Plausible") && privacyPage.includes("Meta"),
  "privacy policy must identify both aggregate analytics and optional advertising measurement providers.",
);
assert(
  privacyPage.includes("California law may treat disclosure") &&
    privacyPage.includes('as "sharing,"'),
  "privacy policy must disclose the potential CCPA/CPRA sharing classification.",
);
assert(
  privacyPage.includes("We do not sell personal information for money"),
  "privacy policy must distinguish sale from optional advertising measurement.",
);
assert(
  privacyPage.includes("a request already in flight before revocation may still complete"),
  "privacy policy must accurately bound client-side revocation behavior.",
);
assert(
  !privacyPage.includes("We do not use advertising, analytics, or cross-site tracking cookies"),
  "public privacy policy must not retain the obsolete no-analytics claim.",
);

assert(
  !csp.includes(removedInlineMetaHash),
  "CSP source must not retain the removed inline Meta hash.",
);
assert(
  !vercelSource.includes(removedInlineMetaHash),
  "Vercel edge CSP must not retain the removed inline Meta hash.",
);
for (const host of retiredAnalyticsHosts) {
  assert(!csp.includes(host), `CSP source must not allow retired analytics host ${host}.`);
  assert(
    !vercelSource.includes(host),
    `Vercel edge CSP must not allow retired analytics host ${host}.`,
  );
}

if (vercel) {
  const globalHeaders = vercel.headers?.find((entry) => entry.source === "/(.*)")?.headers ?? [];
  const edgeCsp = globalHeaders.find((header) => header.key === "Content-Security-Policy")?.value;
  assert(typeof edgeCsp === "string", "vercel.json must publish a global Content-Security-Policy.");
  assert(
    edgeCsp?.includes("https://connect.facebook.net"),
    "edge CSP must allow the post-consent Meta loader.",
  );
}

if (failures.length > 0) {
  console.error("Marketing measurement consent contract failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Marketing measurement consent contract passed.");
