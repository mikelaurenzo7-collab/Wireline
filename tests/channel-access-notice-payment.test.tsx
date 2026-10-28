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

  it("explains SMS is not in a legacy Calls-only plan", () => {
    const notice = ChannelAccessNotice({ access: access("active", "voice"), channel: "sms" })!;
    expect(notice.props.title).toBe("Texts Aren't in Your Plan");
    expect(text(notice.props.children)).toContain("Saved conversations remain available");
    expect(elements(notice).find((element) => element.type === "a")?.props.to).toBe(
      "/settings/billing",
    );
  });

  it.each(["past_due", "unpaid", "incomplete"])(
    "does not turn a %s legacy Calls plan into an SMS upsell",
    (status) => {
      const notice = ChannelAccessNotice({ access: access(status), channel: "sms" })!;
      expect(notice.props.title).toBe("Texts Aren't in Your Plan");
      expect(text(notice.props.children)).toContain("Saved conversations remain available");
    },
  );

  it("keeps the payment prompt on the text tab when the owner's plan includes texting", () => {
    const notice = ChannelAccessNotice({ access: access("past_due", "starter"), channel: "sms" })!;
    expect(notice.props.title).toBe("Payment Needs Attention");
    expect(text(notice.props.children)).toContain("Texts are paused");
  });

  it("keeps the package prompt for a channel that was never bought", () => {
    const notice = ChannelAccessNotice({
      access: access("pending_activation", null),
      channel: "voice",
    })!;
    expect(notice.props.title).toBe("Calls Aren't in Your Plan");
  });

  it("keeps SMS payment recovery for a current usage plan", () => {
    const notice = ChannelAccessNotice({ access: access("past_due", "usage"), channel: "sms" })!;
    expect(notice.props.title).toBe("Payment Needs Attention");
    expect(text(notice.props.children)).toContain("Texts are paused");
  });

  it("offers a plan when an account has not chosen one", () => {
    const notice = ChannelAccessNotice({
      access: access("pending_activation", null),
      channel: "sms",
    })!;
    expect(notice.props.title).toBe("Texts Aren't in Your Plan");
    expect(text(notice.props.children)).toContain("Choose a plan to connect this channel");
    expect(elements(notice).find((element) => element.type === "a")?.props.to).toBe(
      "/settings/billing",
    );
  });

  it("does not show a notice when SMS is included in current access", () => {
    expect(
      ChannelAccessNotice({
        access: { ...access("active", "usage"), includes: (channel) => channel === "sms" },
        channel: "sms",
      }),
    ).toBeNull();
  });

  it.each(["active", "trialing"])(
    "offers a retry when a %s plan includes SMS but access does not",
    (status) => {
      const state = access(status, "usage");
      const notice = ChannelAccessNotice({ access: state, channel: "sms" })!;
      expect(notice.props.title).toBe("Channel Access Unavailable");
      expect(text(notice.props.children)).toContain("couldn't confirm this channel's access");
      expect(elements(notice).find((element) => element.type === "a")).toBeUndefined();
      (notice.props.action as ReactElement<{ onClick: () => void }>).props.onClick();
      expect(state.retry).toHaveBeenCalledOnce();
    },
  );

  it.each(["canceled", "paused", "incomplete_expired", "pending_activation"])(
    "shows an inactive subscription rather than an absent channel for %s",
    (status) => {
      const notice = ChannelAccessNotice({ access: access(status, "usage"), channel: "sms" })!;
      expect(notice.props.title).toBe("Subscription Not Active");
      expect(text(notice.props.children)).toContain("subscription is inactive");
      expect(elements(notice).find((element) => element.type === "a")?.props.to).toBe(
        "/settings/billing",
      );
    },
  );
});
