import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * On 2026-11-27 the first outside customer, in a Spanish-speaking time zone,
 * hit a crash screen a minute after signing up. With the browser translating
 * the page, pressing Create Bot reliably takes the view down: translation
 * replaces the text nodes React made, and React's next insert or removal
 * names a node that is no longer there.
 *
 * A stand-in for the browser's Node, with the same refusals.
 */
class FakeNode {
  parentNode: FakeNode | null = null;
  childNodes: FakeNode[] = [];
  constructor(readonly label: string) {}

  appendChild(node: FakeNode) {
    return this.insertBefore(node, null);
  }

  insertBefore(node: FakeNode, reference: FakeNode | null) {
    if (reference && reference.parentNode !== this) {
      throw new Error(
        "Failed to execute 'insertBefore' on 'Node': The node before which the new node is to be inserted is not a child of this node.",
      );
    }
    if (node.parentNode)
      node.parentNode.childNodes.splice(node.parentNode.childNodes.indexOf(node), 1);
    const index = reference ? this.childNodes.indexOf(reference) : this.childNodes.length;
    this.childNodes.splice(index, 0, node);
    node.parentNode = this;
    return node;
  }

  removeChild(child: FakeNode) {
    if (child.parentNode !== this) {
      throw new Error(
        "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.",
      );
    }
    this.childNodes.splice(this.childNodes.indexOf(child), 1);
    child.parentNode = null;
    return child;
  }
}

const labels = (node: FakeNode) => node.childNodes.map((child) => child.label);

/** A button as React built it: an icon, then its label as a bare text node. */
function button() {
  const parent = new FakeNode("button");
  const icon = parent.appendChild(new FakeNode("wand"));
  const text = parent.appendChild(new FakeNode("Create Bot"));
  return { parent, icon, text };
}

/** What page translation does: the text node is replaced by its own element. */
function translateByReplacing(parent: FakeNode, text: FakeNode) {
  const font = new FakeNode("font: Crear bot");
  parent.insertBefore(font, text);
  parent.removeChild(text);
  return font;
}

/** What some extensions do: the text node is moved inside a wrapper. */
function translateByWrapping(parent: FakeNode, text: FakeNode) {
  const font = new FakeNode("font");
  parent.insertBefore(font, text);
  font.appendChild(text);
  return font;
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  vi.resetModules();
  // Each test starts from the browser's own behaviour.
  const pristine = {
    insertBefore: FakeNode.prototype.insertBefore,
    removeChild: FakeNode.prototype.removeChild,
  };
  restore = () => Object.assign(FakeNode.prototype, pristine);
  vi.stubGlobal("Node", FakeNode);
  warn = vi.spyOn(console, "error").mockImplementation(() => {});
  const { tolerateForeignDomMutations } = await import("../src/lib/dom-reconciliation-recovery");
  install = tolerateForeignDomMutations;
});
let restore = () => {};
let install = () => {};

afterEach(() => {
  restore();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("a page rewritten by translation or an extension", () => {
  it("crashes on the next insert or removal without the guard", () => {
    const { parent, text } = button();
    translateByReplacing(parent, text);
    expect(() => parent.insertBefore(new FakeNode("spinner"), text)).toThrow(/not a child/);
    expect(() => parent.removeChild(text)).toThrow(/not a child/);
  });

  it("still shows a new element when the node it was to go before was replaced", () => {
    install();
    const { parent, icon, text } = button();
    translateByReplacing(parent, text);
    // Pressing Create Bot: React removes the wand and inserts a spinner before the label.
    parent.removeChild(icon);
    expect(() => parent.insertBefore(new FakeNode("spinner"), text)).not.toThrow();
    expect(labels(parent)).toEqual(["font: Crear bot", "spinner"]);
  });

  it("keeps the place when the node it was to go before was only wrapped", () => {
    install();
    const { parent, text } = button();
    translateByWrapping(parent, text);
    parent.insertBefore(new FakeNode("spinner"), text);
    expect(labels(parent)).toEqual(["wand", "spinner", "font"]);
  });

  it("does nothing when asked to remove a node that is already gone", () => {
    install();
    const { parent, text } = button();
    translateByReplacing(parent, text);
    expect(parent.removeChild(text)).toBe(text);
    expect(labels(parent)).toEqual(["wand", "font: Crear bot"]);
  });

  it("removes a node from where it really is when it was moved", () => {
    install();
    const { parent, text } = button();
    const font = translateByWrapping(parent, text);
    parent.removeChild(text);
    expect(font.childNodes).toEqual([]);
    expect(text.parentNode).toBeNull();
  });

  it("says so once, not on every call", () => {
    install();
    const { parent, text } = button();
    translateByReplacing(parent, text);
    parent.insertBefore(new FakeNode("a"), text);
    parent.insertBefore(new FakeNode("b"), text);
    parent.removeChild(text);
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe("a page nothing else has touched", () => {
  it("inserts and removes exactly as the browser does", () => {
    install();
    const { parent, icon, text } = button();
    const spinner = parent.insertBefore(new FakeNode("spinner"), text);
    expect(labels(parent)).toEqual(["wand", "spinner", "Create Bot"]);
    parent.removeChild(icon);
    parent.insertBefore(icon, null);
    expect(labels(parent)).toEqual(["spinner", "Create Bot", "wand"]);
    expect(parent.removeChild(spinner)).toBe(spinner);
    expect(warn).not.toHaveBeenCalled();
  });

  it("is installed once however often it is asked", () => {
    install();
    const once = FakeNode.prototype.insertBefore;
    install();
    expect(FakeNode.prototype.insertBefore).toBe(once);
  });
});

describe("startup", () => {
  const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

  it("installs the guard before React creates its first node", () => {
    const main = read("src/main.tsx");
    const installed = main.indexOf("tolerateForeignDomMutations();");
    expect(installed).toBeGreaterThan(-1);
    expect(installed).toBeLessThan(main.indexOf("createRoot(document.getElementById"));
  });

  it("gives Bo's changing labels their own elements, so a translated page shows the new words", () => {
    // Bo's first conversation replaced the create dialog and its Create Bot button.
    const bo = read("src/components/onboarding/BoOnboarding.tsx");
    expect(bo).toContain('<span key={step === "website" ? "read" : "send"}>');
    expect(bo).toContain('{step === "website" ? COPY.website.read : COPY.send}');
    expect(bo).toContain("<span key={`step-${stepNumber}`}>");
    expect(bo).toContain('<span key={busy || "getting-ready"}>{busy || COPY.gettingReady}</span>');
  });
});
