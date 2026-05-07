// WidgetBoundary tests — same shape as ErrorBoundary's coverage but
// scoped to the inline-widget fallback. The compact fallback is what
// users see when a single dashboard widget crashes, so it must
// always render without itself being a crash surface.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactElement } from "react";
import WidgetBoundary from "../WidgetBoundary";

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));

vi.mock("../../lib/sentry", () => ({
  captureException,
}));

function Boom({ message = "kaboom" }: { message?: string }): ReactElement {
  throw new Error(message);
}

beforeEach(() => {
  captureException.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("WidgetBoundary", () => {
  it("renders children when nothing throws", () => {
    render(<WidgetBoundary label="Recent Calls"><p>healthy</p></WidgetBoundary>);
    expect(screen.getByText("healthy")).toBeInTheDocument();
  });

  it("shows the compact fallback with the label when a child throws", () => {
    render(<WidgetBoundary label="Recent Calls"><Boom /></WidgetBoundary>);
    expect(screen.getByText(/Widget unavailable/i)).toBeInTheDocument();
    expect(screen.getByText("Recent Calls")).toBeInTheDocument();
    expect(screen.getByText(/rest of the page is fine/i)).toBeInTheDocument();
  });

  it("reports the exception to Sentry with the widget label", () => {
    render(<WidgetBoundary label="Hot Leads"><Boom message="boom" /></WidgetBoundary>);
    expect(captureException).toHaveBeenCalledTimes(1);
    const [err, ctx] = captureException.mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect(ctx.widget).toBe("Hot Leads");
    expect(ctx).toHaveProperty("componentStack");
  });

  it("renders a custom fallback when provided", () => {
    render(
      <WidgetBoundary label="X" fallback={<span>nope</span>}>
        <Boom />
      </WidgetBoundary>,
    );
    expect(screen.getByText("nope")).toBeInTheDocument();
    expect(screen.queryByText(/Widget unavailable/i)).not.toBeInTheDocument();
  });

  it("Retry resets state and re-renders children", () => {
    let shouldThrow = true;
    function Conditional() {
      if (shouldThrow) throw new Error("first");
      return <p>recovered</p>;
    }
    const { rerender } = render(
      <WidgetBoundary label="X"><Conditional /></WidgetBoundary>,
    );
    expect(screen.getByText(/Widget unavailable/i)).toBeInTheDocument();
    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: /Retry/i }));
    rerender(<WidgetBoundary label="X"><Conditional /></WidgetBoundary>);
    expect(screen.getByText("recovered")).toBeInTheDocument();
  });

  it("works without a label (anonymous widget)", () => {
    render(<WidgetBoundary><Boom /></WidgetBoundary>);
    expect(screen.getByText(/Widget unavailable/i)).toBeInTheDocument();
    // No label rendered means we never see the "X" heading.
    expect(screen.queryByText(/^Recent Calls$/)).not.toBeInTheDocument();
  });
});
