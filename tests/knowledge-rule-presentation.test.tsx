import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import KnowledgeBaseClaude from "../src/components/KnowledgeBaseClaude";
import { authFetch, safeJson } from "../src/lib/api";

const h = vi.hoisted(() => ({
  cursor: 0,
  content: "",
  knowledge: [] as Array<{ id: number; content: string }>,
  imageUploads: undefined as boolean | undefined,
  setters: [] as ReturnType<typeof vi.fn>[],
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState(initial: unknown) {
    const index = h.cursor++;
    const setter = vi.fn();
    h.setters[index] = setter;
    return [
      index === 0
        ? {
            directives: [{ id: 1, content: h.content }],
            knowledge: h.knowledge,
            capabilities: { image_uploads: h.imageUploads },
          }
        : index === 1
          ? false
          : initial,
      setter,
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
  h.imageUploads = undefined;
  h.setters = [];
  vi.clearAllMocks();
});

describe("knowledge upload capabilities", () => {
  it.each([undefined, false, true])(
    "matches chooser and help to server capability %s",
    (available) => {
      h.imageUploads = available;
      const rendered = KnowledgeBaseClaude({ agentId: "bot-a" });
      const picker = elements(rendered).find((node) => node.type === "input") as ReactElement<{
        accept: string;
      }>;
      expect(picker.props.accept).toContain(".txt,.csv,.md,.markdown");
      expect(picker.props.accept.includes("image/png")).toBe(available === true);
      expect(text(rendered).includes("images (PNG, JPG, WEBP, GIF)")).toBe(available === true);
    },
  );

  it.each(["image/png", ""])(
    "rejects dropped images before reading or uploading (%s)",
    async (type) => {
      const file = { name: "menu.png", type, size: 100, text: vi.fn() };
      const dropZone = elements(KnowledgeBaseClaude({ agentId: "bot-a" })).find(
        (node) => "onDrop" in node.props,
      ) as ReactElement<{ onDrop: (event: unknown) => void }>;
      dropZone.props.onDrop({ preventDefault: vi.fn(), dataTransfer: { files: [file] } });
      await vi.waitFor(() =>
        expect(h.setters[7]).toHaveBeenCalledWith(
          "Image uploads are unavailable. Upload TXT, MD or CSV.",
        ),
      );
      expect(file.text).not.toHaveBeenCalled();
      expect(authFetch).not.toHaveBeenCalled();
    },
  );

  it("keeps text uploads working when images are unavailable", async () => {
    vi.mocked(authFetch).mockResolvedValue({ ok: true } as Response);
    vi.mocked(safeJson).mockResolvedValue({ summary: "Knowledge saved." });
    const file = {
      name: "hours.txt",
      type: "text/plain",
      size: 100,
      text: vi.fn().mockResolvedValue("Open from nine until five."),
    };
    const dropZone = elements(KnowledgeBaseClaude({ agentId: "bot-a" })).find(
      (node) => "onDrop" in node.props,
    ) as ReactElement<{ onDrop: (event: unknown) => void }>;
    dropZone.props.onDrop({ preventDefault: vi.fn(), dataTransfer: { files: [file] } });
    await vi.waitFor(() => expect(authFetch).toHaveBeenCalledTimes(1));
    expect(authFetch).toHaveBeenCalledWith(
      "/api/agent-config/bot-a/assets",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          fileName: "hours.txt",
          mimeType: "text/plain",
          text: "Open from nine until five.",
        }),
      }),
    );
    await vi.waitFor(() => expect(h.setters[5]).toHaveBeenCalledWith("Knowledge saved."));
  });
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
