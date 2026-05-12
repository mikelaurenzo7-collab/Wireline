// IntegrationHealthBanner tests — defends against malformed health
// payloads from the `/api/integrations/health` endpoint. Older
// deployments / partial responses may omit `reasons` (or send `null`),
// which historically crashed AdminSettings with
// "Cannot read properties of undefined (reading 'length')".

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import IntegrationHealthBanner, { type IntegrationHealthPayload } from "../IntegrationHealthBanner";

describe("IntegrationHealthBanner", () => {
  it("renders nothing when health is null", () => {
    const { container } = render(<IntegrationHealthBanner health={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("does not crash when `reasons` is missing entirely", () => {
    // Simulates an older server returning a partial payload.
    const partial = {
      reconnect_google_calendar: false,
      reconnect_microsoft_calendar: false,
    } as unknown as IntegrationHealthPayload;
    const { container } = render(<IntegrationHealthBanner health={partial} />);
    // Nothing needs attention, so banner stays hidden — but critically,
    // the render must NOT throw.
    expect(container.firstChild).toBeNull();
  });

  it("does not crash when `reasons` is null", () => {
    const payload = {
      reconnect_google_calendar: false,
      reconnect_microsoft_calendar: false,
      reasons: null,
    } as unknown as IntegrationHealthPayload;
    const { container } = render(<IntegrationHealthBanner health={payload} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the banner when a reconnect flag is set, even with no `reasons`", () => {
    const payload = {
      reconnect_google_calendar: true,
    } as unknown as IntegrationHealthPayload;
    render(<IntegrationHealthBanner health={payload} />);
    expect(screen.getByText(/reconnect mail or calendar/i)).toBeInTheDocument();
  });

  it("lists each reason as a list item", () => {
    const payload: IntegrationHealthPayload = {
      reconnect_google_calendar: false,
      reconnect_microsoft_calendar: false,
      reasons: ["Google calendar token expired", "Outlook scope missing"],
    };
    render(<IntegrationHealthBanner health={payload} />);
    expect(screen.getByText(/google calendar token expired/i)).toBeInTheDocument();
    expect(screen.getByText(/outlook scope missing/i)).toBeInTheDocument();
  });

  it("renders the integrations CTA only when `onOpenIntegrations` is supplied", () => {
    const payload: IntegrationHealthPayload = {
      reconnect_google_calendar: true,
      reasons: ["needs reconnect"],
    };
    const { rerender } = render(<IntegrationHealthBanner health={payload} />);
    expect(screen.queryByRole("button", { name: /system.*integrations/i })).toBeNull();

    const onOpen = vi.fn();
    rerender(<IntegrationHealthBanner health={payload} onOpenIntegrations={onOpen} />);
    const cta = screen.getByRole("button", { name: /system.*integrations/i });
    cta.click();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("hides itself when nothing needs attention", () => {
    const payload: IntegrationHealthPayload = {
      reconnect_google_calendar: false,
      reconnect_microsoft_calendar: false,
      reasons: [],
    };
    const { container } = render(<IntegrationHealthBanner health={payload} />);
    expect(container.firstChild).toBeNull();
  });
});
