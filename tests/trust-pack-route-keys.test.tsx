import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TrustPackPage from "../src/components/TrustPackPage";

const h = vi.hoisted(() => ({ vertical: undefined as string | undefined }));
vi.mock("react-router", () => ({ Link: "a", useParams: () => ({ vertical: h.vertical }) }));
vi.mock("../src/components/marketing/MarketingChrome", () => ({ default: "marketing-chrome" }));
vi.mock("../src/lib/page-meta", () => ({ PageMeta: "page-meta" }));

type Props = {
  children?: ReactNode;
  noIndex?: boolean;
  path?: string;
  title?: string;
  to?: string;
};
function elements(node: ReactNode): Array<ReactElement<Props>> {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<Props>(node)) return text(node.props.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}

beforeEach(() => {
  h.vertical = undefined;
});

describe("public trust-pack route keys", () => {
  it.each([undefined, "missing", "constructor", "toString", "__proto__", "hasOwnProperty"])(
    "renders the noindex recovery page for %s instead of inherited object content",
    (vertical) => {
      h.vertical = vertical;
      const tree = TrustPackPage();
      const heading = elements(tree).find((node) => node.type === "h1");
      expect(text(heading)).toBe("Trust Pack Not Found");
      expect(elements(tree).find((node) => node.type === "page-meta")?.props.noIndex).toBe(true);
      expect(
        elements(tree).some((node) => node.type === "a" && node.props.to === "/security"),
      ).toBe(true);
    },
  );

  it.each(["medical", "legal", "insurance", "enterprise"])(
    "preserves the %s trust pack and its distinct canonical path",
    (vertical) => {
      h.vertical = vertical;
      const tree = TrustPackPage();
      expect(text(tree)).toContain("What Ships Now");
      expect(text(tree)).not.toContain("Trust Pack Not Found");
      const meta = elements(tree).find((node) => node.type === "page-meta")!;
      expect(meta.props.path).toBe(`/trust/${vertical}`);
      expect(meta.props.title).toContain("BotBound");
      expect(meta.props.noIndex).not.toBe(true);
    },
  );
});
