import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import KnowledgeBaseClaude from "../src/components/KnowledgeBaseClaude";

const h = vi.hoisted(() => ({
  cursor: 0,
  content: "",
  knowledge: [] as Array<{ id: number; content: string }>,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState(initial: unknown) {
    const index = h.cursor++;
    return [
      index === 0
        ? { directives: [{ id: 1, content: h.content }], knowledge: h.knowledge }
        : index === 1
          ? false
          : initial,
      vi.fn(),
    ];
  },
  useRef: (initial: unknown) => ({ current: initial }),
  useCallback: (callback: unknown) => callback,
  useEffect: vi.fn(),
  useLayoutEffect: vi.fn(),
}));
vi.mock("../src/lib/api", () => ({ authFetch: vi.fn(), safeJson: vi.fn() }));
vi.mock("../src/lib/product-event-client", () => ({ emitProductEvent: vi.fn() }));
vi.mock("../src/components/atoms", () => ({ Button: "button", MetricTile: "metric" }));

type Element = ReactElement<{ children?: ReactNode }>;
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return text(node.props.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
function paragraphs(content: string) {
  h.content = content;
  return elements(KnowledgeBaseClaude({ agentId: "bot-a" }))
    .filter((node) => node.type === "p")
    .map(text);
}

beforeEach(() => {
  h.cursor = 0;
  h.knowledge = [];
});

describe("knowledge rule presentation", () => {
  it("keeps bounded knowledge previews on whole-word boundaries", () => {
    h.knowledge = [
      {
        id: 1,
        content: `Website (example.test): Consultations last 30 minutes. Cancellations are accepted up to 24 hours before the appointment. ${"Further document content. ".repeat(10_000)}`,
      },
    ];
    const article = elements(KnowledgeBaseClaude({ agentId: "bot-a" })).find(
      (node) => node.type === "article",
    )!;
    const preview = elements(article)
      .filter((node) => node.type === "div" && typeof node.props.children === "string")
      .map(text);
    expect(preview).toContain("Website (example.test): Consultations last 30 minutes.");
    expect(preview.some((value) => value.startsWith("Cancellations are accepted"))).toBe(true);
    expect(preview.join(" ")).not.toContain("…lations");
    expect(preview.every((value) => value.length <= 91)).toBe(true);
  });

  it("keeps a free-text rule intact instead of splitting a word at a character limit", () => {
    const rule = "Ask before booking. Send billing disputes to the account owner.";
    const rendered = paragraphs(rule);
    expect(rendered).toContain(rule);
    expect(rendered).not.toContain("unt owner.");
  });

  it("still separates an explicitly labelled rule from its complete instruction", () => {
    const instruction = "Ask before booking. Send billing disputes to the account owner.";
    const rendered = paragraphs(`Approval: ${instruction}`);
    expect(rendered).toContain("Approval");
    expect(rendered).toContain(instruction);
  });

  it("preserves a long explicit first-line heading and the following content", () => {
    const heading = "Check the account owner's preferred escalation procedure before booking";
    const rendered = paragraphs(`${heading}\nAsk the caller for their preferred time.`);
    expect(rendered).toContain(heading);
    expect(rendered).toContain("Ask the caller for their preferred time.");
  });

  it("does not mistake a literal ellipsis for generated truncation", () => {
    const rendered = paragraphs("Wait…\nOnly proceed with consent.");
    expect(rendered).toContain("Wait…");
    expect(rendered).toContain("Only proceed with consent.");
    expect(rendered).not.toContain("…\nOnly proceed with consent.");
  });
});
