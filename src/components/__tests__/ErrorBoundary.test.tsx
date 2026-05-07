// ErrorBoundary tests — the last line of defense between a malformed
// API response and a fully-blanked app. Its behavior on errors is
// production-critical resilience.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactElement } from "react";
import ErrorBoundary from "../ErrorBoundary";

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));

vi.mock("../../lib/sentry", () => ({
  captureException,
}));

function Boom({ message = "kaboom" }: { message?: string }): ReactElement {
  throw new Error(message);
}

beforeEach(() => {
  captureException.mockReset();
  // Suppress React's noisy ErrorBoundary error logs in test output.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("ErrorBoundary", () => {
  it("renders children when no error is thrown", () => {
    render(
      <ErrorBoundary>
        <p>healthy content</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("healthy content")).toBeInTheDocument();
  });

  it("renders the recovery panel when a child throws", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/This view crashed/i)).toBeInTheDocument();
    expect(screen.getByText(/The rest of the app is fine/i)).toBeInTheDocument();
  });

  it("surfaces the error message inside the details panel", () => {
    render(
      <ErrorBoundary>
        <Boom message="payload was missing user_id" />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/payload was missing user_id/)).toBeInTheDocument();
  });

  it("reports the exception to Sentry with component-stack context", () => {
    render(
      <ErrorBoundary>
        <Boom message="reportable" />
      </ErrorBoundary>,
    );
    expect(captureException).toHaveBeenCalledTimes(1);
    const [err, ctx] = captureException.mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("reportable");
    expect(ctx).toHaveProperty("componentStack");
  });

  it("renders a custom fallback when provided", () => {
    render(
      <ErrorBoundary fallback={<div>Custom fallback</div>}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Custom fallback")).toBeInTheDocument();
    expect(screen.queryByText(/This view crashed/i)).not.toBeInTheDocument();
  });

  it("honors fallback={null} (renders nothing instead of the default panel)", () => {
    // Used by App.tsx's lazy chrome group: a chunk-load failure for
    // CommandBar/PersonaWizard/etc. should silently drop those non-
    // critical surfaces, NOT render the full crash UI in the shell.
    const { container } = render(
      <ErrorBoundary fallback={null}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.queryByText(/This view crashed/i)).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });

  it("'Try Again' button resets the boundary and re-renders children", () => {
    let shouldThrow = true;
    function Conditional() {
      if (shouldThrow) throw new Error("first attempt");
      return <p>recovered</p>;
    }
    const { rerender } = render(
      <ErrorBoundary>
        <Conditional />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/This view crashed/i)).toBeInTheDocument();

    // Simulate the underlying issue being fixed and the user clicking retry.
    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: /Try Again/i }));
    rerender(
      <ErrorBoundary>
        <Conditional />
      </ErrorBoundary>,
    );
    expect(screen.getByText("recovered")).toBeInTheDocument();
  });

  it("Back to Dashboard link points to root", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    const link = screen.getByRole("link", { name: /Back to Dashboard/i });
    expect(link).toHaveAttribute("href", "/");
  });
});
