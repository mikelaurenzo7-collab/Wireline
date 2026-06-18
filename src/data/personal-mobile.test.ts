import { describe, expect, it } from "vitest";
import {
  ALL_INTENTS,
  APP_DISTRIBUTION,
  DEEP_LINKS,
  FAST_TRIGGERS,
  INTENT_GROUPS,
  PLATFORMS,
  SIRI_PHRASES,
  WIDGETS,
  type ActivationStatus,
} from "./personal-mobile";

const VALID_STATUS: ActivationStatus[] = ["Live", "Setup", "Beta", "Roadmap"];

describe("personal-mobile catalog", () => {
  it("has unique group and intent ids", () => {
    const groupIds = INTENT_GROUPS.map((g) => g.id);
    expect(new Set(groupIds).size).toBe(groupIds.length);
    const intentIds = ALL_INTENTS.map((i) => i.id);
    expect(new Set(intentIds).size).toBe(intentIds.length);
  });

  it("every intent is well-formed", () => {
    for (const intent of ALL_INTENTS) {
      expect(intent.title.length).toBeGreaterThan(0);
      expect(intent.summary.length).toBeGreaterThan(0);
      expect(intent.phrases.length).toBeGreaterThan(0);
      expect(intent.surfaces.length).toBeGreaterThan(0);
      expect(VALID_STATUS).toContain(intent.status);
      expect(typeof intent.opensApp).toBe("boolean");
    }
  });

  it("only ships hands-free intents that don't force an app launch, except Ask", () => {
    // Everyday delegation must be hands-free; the lone app-opener is the
    // general "Ask Wireline" composer. This keeps Siri/CarPlay flows usable.
    const openers = ALL_INTENTS.filter((i) => i.opensApp);
    expect(openers.map((i) => i.id)).toEqual(["ask-assistant"]);
  });

  it("native intent anchors point at real Swift App Intents", () => {
    // Parity guard: every `nativeIntent` must be one we actually ship.
    const shipped = new Set([
      "AskWirelineIntent",
      "CallAgentIntent",
      "SummarizeLastCallIntent",
      "WhatNeedsAttentionIntent",
      "OpenWirelineIntent",
      "TakeThisCallIntent",
    ]);
    for (const intent of ALL_INTENTS) {
      if (intent.nativeIntent) expect(shipped.has(intent.nativeIntent)).toBe(true);
    }
  });

  it("every widget deep link is one the app actually routes", () => {
    // If the web promises a widget, the app must handle its deep link.
    const handled = new Set(DEEP_LINKS.map((d) => d.url));
    for (const widget of WIDGETS) {
      expect(handled.has(widget.deepLink)).toBe(true);
    }
  });

  it("Siri phrase rows reference an intent or the open-app shortcut", () => {
    const intentIds = new Set(ALL_INTENTS.map((i) => i.id));
    for (const row of SIRI_PHRASES) {
      const known = intentIds.has(row.intentId) || row.intentId === "open-wireline";
      expect(known).toBe(true);
      expect(row.phrases.length).toBeGreaterThan(0);
    }
  });

  it("fast triggers and platforms are well-formed", () => {
    for (const trigger of FAST_TRIGGERS) {
      expect(trigger.steps.length).toBeGreaterThanOrEqual(2);
    }
    for (const platform of PLATFORMS) {
      expect(VALID_STATUS).toContain(platform.status);
    }
    // Web is the one surface that's unambiguously live today.
    expect(PLATFORMS.find((p) => p.id === "web")?.status).toBe("Live");
  });

  it("app distribution stays honest while stores are unpublished", () => {
    // Stores aren't live yet — store URLs must be null so we never link to a
    // 404 listing. Flip these to real URLs when the listings publish.
    expect(APP_DISTRIBUTION.ios.storeUrl).toBeNull();
    expect(APP_DISTRIBUTION.android.storeUrl).toBeNull();
    expect(APP_DISTRIBUTION.ios.testflightUrl).toMatch(/^https:\/\//);
  });
});
