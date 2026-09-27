import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import ChannelPlanPicker, { channelPlanHighlights } from "../src/components/ChannelPlanPicker";
import { Checkbox } from "../src/components/ui/shadcn/Checkbox";
import { STRIPE_PLANS } from "../src/lib/plan-catalog";
import {
  activationBillingHref,
  parseSignupIntent,
  sanitizeSignupIntent,
  signupHrefForPlan,
  type SignupPlanId,
} from "../src/lib/signup-intent";
import { signupSchema } from "../src/lib/api-validation";
import { ACCOUNT_PRIVACY_VERSION, ACCOUNT_TERMS_VERSION } from "../src/lib/legal-consent";

type Props = {
  children?: ReactNode;
  checked?: boolean;
  disabled?: boolean;
  onChange?: () => void;
  type?: string;
  value?: string;
  "aria-label"?: string;
};
function elements(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}
const plans = STRIPE_PLANS.filter((plan) => plan.catalogFamily === "channels");
function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (isValidElement<Props>(node)) return text(node.props.children);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
describe("channel package selection", () => {
  it("contains all seven channel combinations at three capacities", () => {
    expect(plans).toHaveLength(21);
  });
  it("discloses the simultaneous call limit only for packages with Calls", () => {
    for (const plan of plans) {
      const highlights = channelPlanHighlights(plan);
      if (plan.channels.includes("voice")) {
        expect(highlights).toContain(
          `${plan.voice_minutes_monthly} call minutes/month · 1 call at a time`,
        );
      } else {
        expect(highlights.join(" ")).not.toMatch(/call minutes|call at a time/);
      }
    }
  });
  it.each(plans)("preserves $id through signup, storage sanitization, and activation", (plan) => {
    const href = signupHrefForPlan(plan.id as SignupPlanId, { interval: "year" });
    const intent = parseSignupIntent(href.slice(href.indexOf("?")));
    expect(intent?.preferredPlanId).toBe(plan.id);
    expect(sanitizeSignupIntent(intent)).toEqual(intent);
    expect(activationBillingHref(intent)).toBe(`/settings/billing?plan=${plan.id}&interval=year`);
    expect(
      signupSchema.safeParse({
        email: "example@example.test",
        password: "SafePassword!123",
        fullName: "Example User",
        preferredPlanId: plan.id,
        termsAccepted: true,
        termsVersion: ACCOUNT_TERMS_VERSION,
        privacyVersion: ACCOUNT_PRIVACY_VERSION,
      }).success,
    ).toBe(true);
  });

  it("maps every channel toggle to its exact package and prevents an empty package", () => {
    for (const plan of plans) {
      const select = vi.fn();
      const tree = ChannelPlanPicker({
        plans,
        selectedPlanId: plan.id,
        onSelectPlan: select,
        interval: "month",
        renderAction: () => null,
      });
      const inputs = elements(tree).filter((element) => element.type === Checkbox);
      expect(inputs).toHaveLength(3);
      ["voice", "email", "sms"].forEach((channel, index) => {
        const checked = plan.channels.includes(channel as "voice" | "email" | "sms");
        expect(inputs[index].props.checked).toBe(checked);
        if (checked && plan.channels.length === 1) {
          expect(inputs[index].props.disabled).toBe(true);
          return;
        }
        inputs[index].props.onChange?.();
        const expectedChannels = checked
          ? plan.channels.filter((value) => value !== channel)
          : [...plan.channels, channel];
        const matching = plans.find(
          (candidate) =>
            candidate.channels.length === expectedChannels.length &&
            candidate.capacityTier === plan.capacityTier &&
            candidate.channels.every((value) => expectedChannels.includes(value)),
        );
        expect(select).toHaveBeenLastCalledWith(matching?.id);
      });
      expect(
        elements(tree).filter((element) => element.props["aria-label"] === "Selected package"),
      ).toHaveLength(1);
    }
  });

  it.each(plans)("changes capacity without changing the $id channels", (plan) => {
    const select = vi.fn();
    const tree = ChannelPlanPicker({
      plans,
      selectedPlanId: plan.id,
      onSelectPlan: select,
      interval: "month",
      renderAction: () => null,
    });
    const radios = elements(tree).filter((element) => element.props.type === "radio");
    expect(radios).toHaveLength(3);
    for (const radio of radios) {
      radio.props.onChange?.();
      const chosen = plans.find((item) => item.id === select.mock.lastCall?.[0]);
      expect(chosen?.channels).toEqual(plan.channels);
      expect(chosen?.capacityTier).toBe(radio.props.value);
    }
  });

  it.each(plans)("shows the actual annual saving for $id", (plan) => {
    const tree = ChannelPlanPicker({
      plans,
      selectedPlanId: plan.id,
      onSelectPlan: vi.fn(),
      interval: "year",
      renderAction: () => null,
    });
    const saving = plan.price_usd_monthly * 12 - plan.price_usd_annual;
    expect(text(tree)).toContain(
      `Save $${saving.toLocaleString(undefined, { maximumFractionDigits: 2 })} vs monthly.`,
    );
    expect(text(tree)).not.toContain("Save 2 months");
  });

  it.each(["voice-business", "voice-scale", "voice-ultra", "__proto__", "constructor"])(
    "rejects unrecognized capacity intent %s",
    (id) => {
      expect(parseSignupIntent(`?plan=${id}`)).toBeNull();
      expect(
        signupSchema.safeParse({
          email: "example@example.test",
          password: "SafePassword!123",
          preferredPlanId: id,
          termsAccepted: true,
          termsVersion: ACCOUNT_TERMS_VERSION,
          privacyVersion: ACCOUNT_PRIVACY_VERSION,
        }).success,
      ).toBe(false);
    },
  );
});
