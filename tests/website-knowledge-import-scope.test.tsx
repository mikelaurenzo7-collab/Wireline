import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WebsiteKnowledgeImport from "../src/components/training/WebsiteKnowledgeImport";

const h = vi.hoisted(() => ({
  states: [] as unknown[],
  refs: [] as Array<{ current: unknown }>,
  stateCursor: 0,
  refCursor: 0,
  effects: [] as Array<() => void | (() => void)>,
  fetch: vi.fn(),
  imported: vi.fn(),
  event: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState(initial: unknown) {
    const index = h.stateCursor++;
    if (!(index in h.states)) h.states[index] = initial;
    return [
      h.states[index],
      (next: unknown) => {
        h.states[index] = typeof next === "function" ? next(h.states[index]) : next;
      },
    ];
  },
  useRef: (initial: unknown) => (h.refs[h.refCursor++] ??= { current: initial }),
  useLayoutEffect: (effect: () => void | (() => void)) => h.effects.push(effect),
}));
vi.mock("../src/lib/api", () => ({
  authFetch: h.fetch,
  safeJson: (response: Response) => response.json(),
}));
vi.mock("../src/lib/product-event-client", () => ({ emitProductEvent: h.event }));
vi.mock("../src/components/atoms", () => ({ Button: "button" }));

type Props = {
  children?: ReactNode;
  value?: string;
  disabled?: boolean;
  role?: string;
  onChange?: (event: { target: { value: string } }) => void;
  onSubmit?: (event: { preventDefault: () => void }) => Promise<void>;
};
function elements(node: ReactNode): Array<ReactElement<Props>> {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function render(agentId = "bot-a") {
  h.stateCursor = 0;
  h.refCursor = 0;
  h.effects = [];
  return WebsiteKnowledgeImport({ agentId, onImported: h.imported });
}
function input(agentId = "bot-a") {
  return elements(render(agentId)).find((node) => node.type === "input")!;
}
function submit(agentId = "bot-a") {
  return elements(render(agentId)).find((node) => node.type === "form")!.props.onSubmit!({
    preventDefault: vi.fn(),
  });
}
function changeAgent(agentId: string) {
  render(agentId);
  h.effects[0]?.();
  render(agentId);
}

beforeEach(() => {
  h.states = [];
  h.refs = [];
  h.effects = [];
  h.fetch.mockReset();
  h.imported.mockReset();
  h.event.mockReset();
});

describe("website knowledge import scope", () => {
  it.each([200, 503])(
    "keeps another Bot's form clear after the old import returns HTTP %s",
    async (status) => {
      let resolve!: (response: Response) => void;
      h.fetch.mockReturnValueOnce(
        new Promise<Response>((done) => {
          resolve = done;
        }),
      );
      changeAgent("bot-a");
      input().props.onChange!({ target: { value: "https://example.com/bot-a" } });
      const pending = submit();
      expect(input().props.disabled).toBe(true);

      changeAgent("bot-b");

      expect(input("bot-b").props.value).toBe("");
      expect(input("bot-b").props.disabled).toBe(false);
      resolve(
        new Response(JSON.stringify({ summary: "Bot A imported", error: "Bot A failed" }), {
          status,
        }),
      );
      await pending;
      const notices = elements(render("bot-b")).filter(
        (node) => node.props.role === "status" || node.props.role === "alert",
      );
      expect(notices).toHaveLength(0);
      expect(h.imported).not.toHaveBeenCalled();
      expect(h.event).not.toHaveBeenCalled();
    },
  );

  it("still confirms an import for the selected Bot", async () => {
    h.fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ summary: "Knowledge imported", factsAdded: 2 })),
    );
    changeAgent("bot-a");
    input().props.onChange!({ target: { value: "https://example.com/bot-a" } });

    await submit();

    expect(elements(render()).find((node) => node.props.role === "status")?.props.children).toBe(
      "Knowledge imported",
    );
    expect(h.imported).toHaveBeenCalledOnce();
    expect(h.event).toHaveBeenCalledWith(expect.objectContaining({ agentId: "bot-a" }));
    expect(input().props.disabled).toBe(false);
  });
});
