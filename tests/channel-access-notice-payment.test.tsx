import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-router", () => ({ Link: "a" }));

import ChannelAccessNotice from "../src/components/ChannelAccessNotice";

type Props = { children?: ReactNode; title?: string; tone?: string; to?: string };
function elements(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  const props = node.props as Props & { action?: ReactNode };
  return [node, ...elements(props.children), ...elements(props.action)];
}
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<Props>(node)) return text(node.props.children);
  return typeof node === "string" ? node : "";
}
const access = (subscription_status: string, plan_id: string | null = "voice-regular") => ({
  status: "ready" as const,
  data: { plan_id, subscription_status, channels: [], is_owner: false },
  retry: vi.fn(),
  includes: () => false,
});

describe("channel access notice", () => {
  it.each(["past_due", "unpaid", "incomplete"])(
    "asks a %s owner to update payment instead of choosing a package",
    (status) => {
      const notice = ChannelAccessNotice({ access: access(status), channel: "voice" })!;
      expect(notice.props.title).toBe("Payment Needs Attention");
      expect(notice.props.tone).toBe("warning");
      expect(text(notice.props.children)).toContain(
        "aren't answered until your payment is updated",
      );
      const link = elements(notice).find((element) => element.type === "a");
      expect(link?.props.to).toBe("/settings/billing");
    },
  );

  it("keeps the package prompt for a channel that was never bought", () => {
    const notice = ChannelAccessNotice({
      access: access("pending_activation", null),
      channel: "voice",
    })!;
    expect(notice.props.title).toBe("Calls Aren't in Your Plan");
  });
});
