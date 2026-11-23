import { createHmac, timingSafeEqual } from "node:crypto";

import { BOTBOUND_PRODUCTION_ORIGIN } from "./brand";
import { getDataKey, isVaultConfigured } from "./secret-vault";

/**
 * Signed links to the texting privacy policy and terms BotBound hosts for a
 * business that has no website of its own (usually a sole proprietor). Since
 * June 30, 2026 every US texting campaign needs both URLs, and they must name
 * the business that sends the texts. The link carries the brand name and an
 * HMAC, so the public page shows only names BotBound signed, with no database
 * read on an unauthenticated path.
 *
 * The key is derived from WIRELINE_DATA_KEY (domain-separated, like the email
 * unsubscribe links). Carriers keep these URLs on file for the life of the
 * campaign: rotating the data key breaks every registered link, so a rotation
 * must re-sign and update each campaign first.
 */

const TOKEN_LABEL = "texting-policy-v1";
const MAX_BRAND = 60;
// 60 UTF-16 units are at most 180 UTF-8 bytes, 240 base64url characters.
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{1,240}\.[A-Za-z0-9_-]{43}$/;

export const TEXTING_POLICY_DOCUMENTS = ["privacy", "terms"] as const;
export type TextingPolicyDocument = (typeof TEXTING_POLICY_DOCUMENTS)[number];

function policyKey(): string {
  return createHmac("sha256", getDataKey().toString("base64")).update(TOKEN_LABEL).digest("hex");
}

/** Collapse whitespace; refuse empty, overlong or control-character names. */
function cleanBrand(brandName: string): string | null {
  const brand = String(brandName ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const control = [...brand].some(
    (char) => char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f,
  );
  if (!brand || brand.length > MAX_BRAND || control) return null;
  return brand;
}

/** Sign a link token for this brand. Throws without WIRELINE_DATA_KEY: an unsigned link would never verify in production. */
export function signTextingPolicyToken(brandName: string): string {
  const brand = cleanBrand(brandName);
  if (!brand) throw new Error("A brand name of 1 to 60 characters is required.");
  const payload = Buffer.from(brand, "utf8").toString("base64url");
  const sig = createHmac("sha256", policyKey()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

/** The brand name a token was signed for, or null for anything forged, malformed or unverifiable. */
export function verifyTextingPolicyToken(token: unknown): string | null {
  if (typeof token !== "string" || !TOKEN_SHAPE.test(token) || !isVaultConfigured()) return null;
  const [payload, sig] = token.split(".");
  const expected = createHmac("sha256", policyKey()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return cleanBrand(Buffer.from(payload, "base64url").toString("utf8"));
}

/** Public URLs carriers review; always the production origin, never a preview host. */
export function textingPolicyUrls(brandName: string): { privacyUrl: string; termsUrl: string } {
  const token = signTextingPolicyToken(brandName);
  const base = `${BOTBOUND_PRODUCTION_ORIGIN}/texting/${token}`;
  return { privacyUrl: `${base}/privacy`, termsUrl: `${base}/terms` };
}
