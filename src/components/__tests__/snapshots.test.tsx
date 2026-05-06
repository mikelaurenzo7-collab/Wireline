// Snapshot tests for complex stateful components
//
// These capture the rendered output of intricate components to detect
// unintended UI changes during refactoring. Snapshots are version-controlled
// and must be explicitly reviewed/approved when changed.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../../contexts/ToastContext";

// ── Module-level mocks ──────────────────────────────────────────────────
vi.mock("../../lib/api", () => ({
  authFetch: vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => "",
  }),
  safeJson: vi.fn().mockResolvedValue({}),
}));

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

describe("Component snapshots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("LiveMonitor snapshot", async () => {
    const { default: LiveMonitor } = await import("../LiveMonitor");
    const { container } = harness(<LiveMonitor />);
    expect(container.innerHTML).toMatchSnapshot();
  });

  it("SupervisedAgentTuner snapshot", async () => {
    const { default: SupervisedAgentTuner } = await import("../SupervisedAgentTuner");
    const { container } = harness(<SupervisedAgentTuner />);
    expect(container.innerHTML).toMatchSnapshot();
  });

  it("OutboundDialer snapshot", async () => {
    const { default: OutboundDialer } = await import("../OutboundDialer");
    const { container } = harness(<OutboundDialer />);
    expect(container.innerHTML).toMatchSnapshot();
  });

  it("PersonaWizard snapshot", async () => {
    const { default: PersonaWizard } = await import("../PersonaWizard");
    const { container } = harness(<PersonaWizard />);
    expect(container.innerHTML).toMatchSnapshot();
  });
});
