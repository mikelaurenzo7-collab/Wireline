import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  OUTBOUND_CONSENT_LABEL,
  OUTBOUND_CONSENT_LEGAL_PATH,
} from "../src/lib/outbound-consent-copy";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("outbound consent copy contract", () => {
  it("exports canonical label and legal path", () => {
    expect(OUTBOUND_CONSENT_LABEL).toContain("permission to call");
    expect(OUTBOUND_CONSENT_LEGAL_PATH).toBe("/trust/legal");
  });

  it("aligns Android and iOS outbound consent labels", () => {
    const android = read("android/app/src/main/java/com/wireline/app/ui/OutboundConsentCopy.kt");
    const ios = read("ios/Wireline/OutboundConsentCopy.swift");
    expect(android).toContain(OUTBOUND_CONSENT_LABEL);
    expect(ios).toContain(OUTBOUND_CONSENT_LABEL);
  });
});
