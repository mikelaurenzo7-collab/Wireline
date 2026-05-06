// Smoke tests for the four heaviest top-level surfaces.
//
// These don't assert on specific UI — they only verify that each page
// component mounts with a typical empty-API-response shape and doesn't
// throw a render error. That alone catches:
//   · regressions in module-level evaluation (e.g. invalid env access)
//   · unhandled promise rejections during initial fetches
//   · TypeError on first render from missing optional chaining
//
// Heavier behavioral tests live in their own files.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../../contexts/ToastContext";

// ── Module-level mocks ──────────────────────────────────────────────────
// authFetch always resolves to an empty/200 response so each component
// reaches its first render without scheduling pending work.
vi.mock("../../lib/api", () => ({
  authFetch: vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => "",
  }),
  safeJson: vi.fn().mockResolvedValue({}),
}));

// Vapi browser SDK fires up a worker on import — stub it to a no-op
// constructor so DashboardHome doesn't try to open a websocket in JSDOM.
vi.mock("@vapi-ai/web", () => ({
  default: class {
    on = () => this;
    off = () => this;
    removeAllListeners = () => this;
    start = () => Promise.resolve();
    stop = () => Promise.resolve();
    say = () => {};
    isMuted = () => false;
    setMuted = () => {};
  },
}));

// Recharts Responsive container measures DOM rect — stub it to render
// children directly so charts don't yell about width=0.
vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: any) => <div style={{ width: 800, height: 400 }}>{children}</div>,
  };
});

const harness = (node: React.ReactNode) =>
  render(
    <MemoryRouter>
      <ToastProvider>{node}</ToastProvider>
    </MemoryRouter>,
  );

describe("Top-level page smoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("DashboardHome mounts without throwing", async () => {
    const { default: DashboardHome } = await import("../DashboardHome");
    const { container } = harness(<DashboardHome />);
    await waitFor(() => expect(container.firstChild).toBeTruthy());
  });

  it("TriageInbox mounts without throwing", async () => {
    const { default: TriageInbox } = await import("../TriageInbox");
    const { container } = harness(<TriageInbox />);
    await waitFor(() => expect(container.firstChild).toBeTruthy());
  });

  it("FleetSettings mounts without throwing", async () => {
    const { default: FleetSettings } = await import("../FleetSettings");
    const { container } = harness(<FleetSettings />);
    await waitFor(() => expect(container.firstChild).toBeTruthy());
  });

  it("OutboundDialer mounts without throwing", async () => {
    const { default: OutboundDialer } = await import("../OutboundDialer");
    const { container } = harness(<OutboundDialer />);
    await waitFor(() => expect(container.firstChild).toBeTruthy());
  });
});
