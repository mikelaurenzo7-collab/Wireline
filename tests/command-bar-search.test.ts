import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CommandBar, {
  searchWorkspaceCommands,
  workspaceCommandHref,
} from "../src/components/CommandBar";
import { scopedWorkspaceHref } from "../src/constants/navigation";

const h = vi.hoisted(() => ({
  states: [] as unknown[],
  cursor: 0,
  params: new URLSearchParams(),
  navigate: vi.fn(),
}));

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState(initial: unknown) {
    const index = h.cursor++;
    if (!(index in h.states)) h.states[index] = initial;
    return [
      h.states[index],
      (value: unknown) => {
        h.states[index] = value;
      },
    ];
  },
  useRef: (initial: unknown) => ({ current: initial }),
  useMemo: (compute: () => unknown) => compute(),
  useCallback: (callback: unknown) => callback,
  useEffect: () => undefined,
}));
vi.mock("react-router", () => ({
  useLocation: () => ({ pathname: "/knowledge" }),
  useSearchParams: () => [h.params, vi.fn()],
  useNavigate: () => h.navigate,
}));
vi.mock("motion/react", () => ({
  motion: { div: "div" },
  AnimatePresence: "presence",
  useReducedMotion: () => true,
}));
vi.mock("../src/contexts/AgentsContext", () => ({
  useAgents: () => ({ agents: [{ id: "known-bot", name: "Known Bot" }] }),
}));
vi.mock("../src/hooks/useMediaQuery", () => ({ useMediaQuery: () => false }));
vi.mock("../src/lib/use-body-scroll-lock", () => ({ useBodyScrollLock: () => undefined }));
vi.mock("../src/lib/use-modal-focus-trap", () => ({ useModalFocusTrap: () => undefined }));
vi.mock("../src/components/atoms", () => ({
  Button: "button",
  Input: "input",
  EmptyState: "empty-state",
}));
vi.mock("../src/components/ui/shadcn/ScrollArea", () => ({ ScrollArea: "scroll-area" }));

type Props = {
  children?: ReactNode;
  id?: string;
  role?: string;
  "aria-controls"?: string;
  "aria-activedescendant"?: string;
  onClick?: () => void;
};
function elements(node: ReactNode): Array<ReactElement<Props>> {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function commands() {
  h.cursor = 0;
  return elements(CommandBar());
}

beforeEach(() => {
  h.states = [true, "", 0];
  h.cursor = 0;
  h.params = new URLSearchParams();
  h.navigate.mockReset();
  vi.stubGlobal("window", { localStorage: { getItem: () => "known-bot" } });
});
afterEach(() => vi.unstubAllGlobals());

describe("workspace command discovery", () => {
  it("preserves the selected Bot for workspace navigation without scoping account actions", () => {
    expect(workspaceCommandHref("/computer", "bot/a")).toBe("/studio?panel=computer&agent=bot%2Fa");
    expect(workspaceCommandHref("/knowledge", "bot-b")).toBe("/knowledge?agent=bot-b");
    expect(workspaceCommandHref("/studio", "bot-b")).toBe("/studio?agent=bot-b");
    expect(workspaceCommandHref("/computer", null)).toBe("/studio?panel=computer");
    expect(workspaceCommandHref("/studio?create=1", "bot-b")).toBe("/studio?create=1");
    expect(workspaceCommandHref("/settings/billing", "bot-b")).toBe("/settings/billing");
  });

  it.each(["missing/bot", null])(
    "keeps explicit unavailable scope or the selected default in both navigation entries (%s)",
    (requested) => {
      if (requested) h.params.set("agent", requested);
      const scope = requested ?? "known-bot";
      const href = `/studio?panel=computer&agent=${encodeURIComponent(scope)}`;
      expect(scopedWorkspaceHref("/computer", scope)).toBe(href);
      expect(scopedWorkspaceHref("/studio", scope)).toBe(
        `/studio?agent=${encodeURIComponent(scope)}`,
      );
      commands()
        .find((node) => node.props.id === "command-palette-option-computer")
        ?.props.onClick?.();
      expect(h.navigate).toHaveBeenCalledExactlyOnceWith(href);
    },
  );

  it("keeps the combobox result reference valid with no options and announces the empty state", () => {
    h.states[1] = "no matching destination";
    const nodes = commands();
    const input = nodes.find((node) => node.props.role === "combobox");
    const listbox = nodes.find((node) => node.props.role === "listbox");
    expect(listbox?.props.id).toBe(input?.props["aria-controls"]);
    expect(listbox).toBeDefined();
    expect(nodes.some((node) => node.props.role === "option")).toBe(false);
    expect(input?.props["aria-activedescendant"]).toBeUndefined();
    expect(nodes.find((node) => node.props.role === "status")?.props.children).toBeDefined();
  });

  it.each(["knowledge", "rules", "memory", "training"])(
    "finds editable knowledge for %s",
    (query) => {
      expect(searchWorkspaceCommands(query).map((command) => command.href)).toContain("/knowledge");
    },
  );

  it.each(["Calendar", "appointments", "availability", "bookings"])(
    "routes %s to Calendar",
    (query) => {
      expect(searchWorkspaceCommands(query).map((command) => command.href)).toEqual(["/calendar"]);
    },
  );

  it("keeps Calls discoverable without claiming appointment ownership", () => {
    expect(searchWorkspaceCommands("calls").map((command) => command.href)).toEqual(["/phone"]);
    expect(searchWorkspaceCommands("sms")).toEqual([]);
    expect(searchWorkspaceCommands("campaign")).toEqual([]);
    expect(searchWorkspaceCommands("lead hunt")).toEqual([]);
    expect(searchWorkspaceCommands("appointments").map((command) => command.href)).not.toContain(
      "/phone",
    );
    expect(searchWorkspaceCommands("   ").map((command) => command.href)).toContain("/calendar");
  });
});
