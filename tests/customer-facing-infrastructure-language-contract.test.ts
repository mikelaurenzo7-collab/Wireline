import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { globSync } from "glob";
import { describe, expect, it } from "vitest";

/**
 * Infrastructure vocabulary that leaks into a customer surface reads as a fault.
 *
 * The Connections catalog rendered "Salesforce · Not configured on this
 * deployment" on every integration whose platform credentials Wireline has not
 * switched on. A customer has no mental model for "this deployment", so a
 * roadmap state read as something broken — on the page whose whole job is to
 * show how much the product connects to.
 *
 * `docs/CUSTOMER_TERMINOLOGY.md` already governs product nouns. This contract
 * covers the other direction: operator and infrastructure words that should
 * never reach a customer-facing string.
 *
 * Scope is deliberately narrow. It reads displayed string and template literals
 * in `src/components` and `src/pages`, not comments, imports, or class names —
 * and it names the surfaces where the same word is legitimately about
 * infrastructure, so a real security or developer page is not forced to
 * paraphrase itself.
 */

const root = process.cwd();

/** Words that describe our infrastructure, not the customer's situation. */
const OPERATOR_VOCABULARY = [
  "this deployment",
  "env var",
  "environment variable",
  "database migration",
  "connection pool",
  "stack trace",
];

/**
 * Surfaces that are legitimately about infrastructure and speak to a technical
 * reader. Each is a deliberate, reviewed exception rather than a blanket skip.
 */
const TECHNICAL_SURFACES = new Set([
  // The security page explains our engineering controls to a technical buyer.
  "src/components/Security.tsx",
  // The comparison page addresses developers choosing models and telephony.
  "src/pages/Compare.tsx",
  // Developer docs surface: request/response shapes and API mechanics.
  "src/pages/Developers.tsx",
]);

/**
 * Comments explain code and often have to name the thing they are steering away
 * from — including the very phrases below. Strip them first, or this contract
 * flags the note explaining why the offending copy was replaced.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Displayed text: double-quoted strings and template literals, not code. */
function displayedStrings(source: string): string[] {
  const code = withoutComments(source);
  const out: string[] = [];
  for (const m of code.matchAll(/"([^"\\]{4,200})"/g)) out.push(m[1]);
  for (const m of code.matchAll(/`([^`\\]{4,300})`/g)) out.push(m[1]);
  return out;
}

describe("customer-facing infrastructure language contract", () => {
  it("keeps operator vocabulary out of customer-facing copy", () => {
    const offenders: string[] = [];

    const files = globSync("src/{components,pages}/**/*.tsx", { cwd: root })
      .map((f) => f.replaceAll("\\", "/"))
      .filter((f) => !TECHNICAL_SURFACES.has(f))
      .sort();

    // A glob that silently matches nothing would make this contract vacuous.
    expect(files.length, "no component or page files found -- the glob changed").toBeGreaterThan(
      50,
    );

    for (const file of files) {
      const source = readFileSync(resolve(root, file), "utf8");
      for (const text of displayedStrings(source)) {
        // Tailwind class strings and selectors are not prose.
        if (/^[\w:/[\]().,%-]+$/.test(text) && !text.includes(" ")) continue;
        for (const term of OPERATOR_VOCABULARY) {
          if (text.toLowerCase().includes(term)) {
            offenders.push(`${file}: "${text.slice(0, 90)}"`);
          }
        }
      }
    }

    expect(
      offenders,
      `operator vocabulary in customer-facing copy:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("states the unconfigured-integration case in customer terms", () => {
    const card = readFileSync(resolve(root, "src/components/CrmConnectionCard.tsx"), "utf8");

    expect(card, "the integration catalog must not mention deployments").not.toContain(
      "Not configured on this deployment",
    );
    expect(card, "an unavailable integration should read as a roadmap state").toContain(
      "Not available yet",
    );
  });
});
