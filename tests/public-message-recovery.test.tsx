import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContactPage } from "../src/components/ContactPage";
import { SupportPage } from "../src/components/SupportPage";

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));

// Exercise the actual form handlers and rendered controls with the repository's
// lightweight, persistent-state UI harness; no browser or live messages needed.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState(initial: unknown) {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) {
      hooks.values[index] = typeof initial === "function" ? initial() : initial;
    }
    return [
      hooks.values[index],
      (value: unknown) => {
        hooks.values[index] = value;
      },
    ];
  },
}));
vi.mock("react-router", () => ({
  Link: "a",
  useSearchParams: () => [new URLSearchParams()],
}));
vi.mock("../src/components/layout/MarketingPageFrame", () => ({ default: "marketing-frame" }));
vi.mock("../src/lib/page-meta", () => ({ PageMeta: "page-meta" }));
vi.mock("../src/components/ui/shadcn/Input", () => ({ Input: "input" }));

type Props = {
  children?: ReactNode;
  value?: string;
  href?: string;
  role?: string;
  onClick?: () => void;
  onChange?: (event: { target: { value: string } }) => void;
  onSubmit?: (event: { preventDefault: () => void }) => Promise<void>;
};
type Element = ReactElement<Props>;

function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  return isValidElement<Props>(node) ? [node, ...elements(node.props.children)] : [];
}

function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<Props>(node)) return text(node.props.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}

const fetchMock = vi.fn();
const navigate = vi.fn();
const response = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), { status });

beforeEach(() => {
  hooks.values = [];
  hooks.cursor = 0;
  fetchMock.mockReset();
  navigate.mockReset();
  const location = {};
  Object.defineProperty(location, "href", {
    get: () => "http://localhost:3000/contact",
    set: navigate,
  });
  vi.stubGlobal("window", { location });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe.each([
  {
    name: "Contact",
    component: ContactPage,
    emailLabel: "Email",
    bodyLabel: "Message",
    success: "Message Received",
  },
  {
    name: "Support",
    component: SupportPage,
    emailLabel: "Your email",
    bodyLabel: "Details",
    success: "Request Received",
  },
])("$name message recovery", ({ name, component, emailLabel, bodyLabel, success }) => {
  let tree: ReactNode;
  const render = () => {
    hooks.cursor = 0;
    tree = component();
  };
  const control = (label: string) => {
    const wrapper = elements(tree).find(
      (node) => node.type === "label" && text(node).trim().startsWith(label),
    );
    const input = elements(wrapper).find((node) => node.props.onChange);
    if (!input) throw new Error(`Missing field: ${label}`);
    return input;
  };
  const change = (label: string, value: string) => {
    control(label).props.onChange?.({ target: { value } });
    render();
  };
  const fallback = () =>
    elements(tree).find((node) => node.type === "a" && text(node).trim() === "Send by Email");
  const submit = () => {
    const form = elements(tree).find((node) => node.type === "form");
    if (!form?.props.onSubmit) throw new Error("Missing message form");
    return form.props.onSubmit({ preventDefault() {} });
  };
  beforeEach(() => {
    render();
    change(emailLabel, "owner@example.com");
    change("Subject", "Phone routing question");
    change(bodyLabel, "Please help with my routing rules.");
  });

  it.each(["network", "server", "unconfirmed"])(
    "keeps the draft and offers a deliberate email action after %s failure",
    async (failure) => {
      if (failure === "network") fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
      else
        fetchMock.mockResolvedValueOnce(
          response(
            failure === "server" ? { error: "Unavailable" } : { sent: false },
            failure === "server" ? 503 : 200,
          ),
        );
      await submit();
      render();
      expect(navigate).not.toHaveBeenCalled();
      expect(control(emailLabel).props.value).toBe("owner@example.com");
      expect(control(bodyLabel).props.value).toBe("Please help with my routing rules.");
      expect(text(tree)).toContain("Delivery wasn't confirmed. Retry or send by email.");
      expect(text(tree)).not.toContain(success);
      expect(fallback()?.props.href).toMatch(/^mailto:support@botbound\.me\?/);
    },
  );

  it("uses the current visible draft, topic and contact details in the email action", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await submit();
    render();
    change(emailLabel, "updated+reply@example.com");
    change("Subject", "Updated & urgent?");
    change(bodyLabel, "Updated note with & punctuation\nand another line.");
    const topic = name === "Contact" ? "General" : "Billing or refund";
    elements(tree)
      .find((node) => node.type === "button" && text(node) === topic)
      ?.props.onClick?.();
    render();
    if (name === "Contact") {
      change("Company or organization", "Updated Company");
      change("Callback number", "+1 312 555 0123");
    }
    const mail = new URL(fallback()!.props.href!);
    expect(mail.pathname).toBe("support@botbound.me");
    expect(mail.searchParams.get("subject")).toBe(
      `[${name === "Contact" ? "BotBound / general" : "Support / billing"}] Updated & urgent?`,
    );
    const body = mail.searchParams.get("body")!;
    expect(body).toContain("From: updated+reply@example.com");
    expect(body).toContain("Updated note with & punctuation\nand another line.");
    expect(body).not.toContain("Please help with my routing rules.");
    if (name === "Contact") {
      expect(body).toContain("Company: Updated Company");
      expect(body).toContain("Preferred callback: +1 312 555 0123");
    }
    expect(navigate).not.toHaveBeenCalled();
  });

  it("clears recovery while retrying and shows success only after delivery is confirmed", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await submit();
    render();
    expect(fallback()).toBeDefined();
    let finish!: (value: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
    );
    const retry = submit();
    render();
    expect(fallback()).toBeUndefined();
    expect(text(tree)).not.toContain("Delivery wasn't confirmed");
    finish(response({ sent: true }));
    await retry;
    render();
    expect(text(tree)).toContain(success);
    expect(fallback()).toBeUndefined();
  });

  it.each([400, 429])(
    "preserves authoritative HTTP %i errors without suggesting a bypass",
    async (status) => {
      fetchMock.mockResolvedValueOnce(
        response({ error: "Network policy requires a different request." }, status),
      );
      await submit();
      render();
      expect(text(tree)).toContain("Network policy requires a different request.");
      expect(fallback()).toBeUndefined();
      expect(navigate).not.toHaveBeenCalled();
    },
  );
});
