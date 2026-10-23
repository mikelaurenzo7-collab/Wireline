import { describe, expect, it } from "vitest";

import {
  clearStudioInspectorSectionParams,
  normalizeStudioRouteParams,
  readStudioWorkroomMode,
  reconcileStudioCommandDraft,
  setStudioInspectorSectionParams,
  setStudioWorkroomModeParams,
} from "../src/lib/studio-route-state";
import { addTemporaryTabIndex, type TemporaryTabIndexTarget } from "../src/lib/temporary-tab-index";

function attributeTarget(initial?: string) {
  const attributes = new Map<string, string>();
  if (initial !== undefined) attributes.set("tabindex", initial);

  const target: TemporaryTabIndexTarget = {
    getAttribute(name) {
      return attributes.get(name) ?? null;
    },
    hasAttribute(name) {
      return attributes.has(name);
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
    setAttribute(name, value) {
      attributes.set(name, value);
    },
  };

  return { attributes, target };
}

describe("temporary tabindex cleanup", () => {
  it("removes only the tabindex it injected", () => {
    const { attributes, target } = attributeTarget();
    const restore = addTemporaryTabIndex(target);

    expect(attributes.get("tabindex")).toBe("-1");
    restore();
    expect(attributes.has("tabindex")).toBe(false);
  });

  it("preserves author-defined tabindex values", () => {
    const authorNegative = attributeTarget("-1");
    addTemporaryTabIndex(authorNegative.target)();
    expect(authorNegative.attributes.get("tabindex")).toBe("-1");

    const authorFocusable = attributeTarget("0");
    addTemporaryTabIndex(authorFocusable.target)();
    expect(authorFocusable.attributes.get("tabindex")).toBe("0");
  });

  it("does not erase a later tabindex change", () => {
    const { attributes, target } = attributeTarget();
    const restore = addTemporaryTabIndex(target);
    attributes.set("tabindex", "0");

    restore();
    expect(attributes.get("tabindex")).toBe("0");
  });
});

describe("Studio route state", () => {
  it("treats explicit test links and command links as test mode", () => {
    expect(
      readStudioWorkroomMode({
        section: null,
        workroom: "test",
        command: null,
        commandNonce: null,
      }),
    ).toBe("test");
    expect(
      readStudioWorkroomMode({
        section: "test",
        workroom: null,
        command: null,
        commandNonce: null,
      }),
    ).toBe("test");
    expect(
      readStudioWorkroomMode({
        section: null,
        workroom: null,
        command: "Call this lead",
        commandNonce: null,
      }),
    ).toBe("test");
  });

  it("normalizes legacy links into independent workroom and inspector state", () => {
    const legacyTest = normalizeStudioRouteParams(
      new URLSearchParams("agent=bot-1&section=test&mode=workroom"),
    );
    expect(legacyTest.toString()).toBe("agent=bot-1&workroom=test");

    const legacyInspector = normalizeStudioRouteParams(
      new URLSearchParams("agent=bot-1&view=workspace"),
    );
    expect(legacyInspector.toString()).toBe("agent=bot-1&section=setup");

    const combinedLegacy = normalizeStudioRouteParams(
      new URLSearchParams("agent=bot-1&mode=workroom&view=workspace"),
    );
    expect(combinedLegacy.toString()).toBe("agent=bot-1&workroom=test");
  });

  it("returns to build mode by clearing sticky command state", () => {
    const current = new URLSearchParams(
      "agent=bot-1&section=review&workroom=test&command=Call+this+lead&commandNonce=2&mode=workroom",
    );
    const next = setStudioWorkroomModeParams(current, "configure");

    expect(next.get("agent")).toBe("bot-1");
    expect(next.get("section")).toBe("review");
    expect(next.has("workroom")).toBe(false);
    expect(next.has("command")).toBe(false);
    expect(next.has("commandNonce")).toBe(false);
    expect(next.has("mode")).toBe(false);
  });

  it("preserves test mode while opening and closing the inspector", () => {
    const inspector = setStudioInspectorSectionParams(
      new URLSearchParams("agent=bot-1&workroom=test&command=Hello&commandNonce=3"),
      "review",
    );
    expect(inspector.toString()).toBe("agent=bot-1&workroom=test&section=review&chat=setup");
    expect(inspector.has("command")).toBe(false);
    expect(inspector.has("commandNonce")).toBe(false);

    const closed = clearStudioInspectorSectionParams(inspector);
    expect(closed.toString()).toBe("agent=bot-1&workroom=test&chat=setup");
  });

  it("writes canonical test state without disturbing inspector selection", () => {
    const test = setStudioWorkroomModeParams(
      new URLSearchParams("agent=bot-1&section=setup"),
      "test",
    );
    expect(test.toString()).toBe("agent=bot-1&section=setup&workroom=test");
  });

  it("clears only an untouched route-injected command", () => {
    expect(reconcileStudioCommandDraft("Call this lead", "Call this lead", null)).toBe("");
    expect(reconcileStudioCommandDraft("Call this lead tomorrow", "Call this lead", null)).toBe(
      "Call this lead tomorrow",
    );
    expect(reconcileStudioCommandDraft("", null, "  New customer question  ")).toBe(
      "New customer question",
    );
  });
});
