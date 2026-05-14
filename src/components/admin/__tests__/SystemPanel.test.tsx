import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SystemPanel } from "../SystemPanel";

describe("SystemPanel", () => {
  const mockProps = {
    claudeStatus: { available: true, model: "claude-3-5-sonnet" },
    integrations: [],
    operationalSlos: {
      evaluated_at: new Date().toISOString(),
      dimensions: { jobs_queue: 'ok' },
      jobs: { queue: { pending: 0, done_last_hour: 5 } }
    },
    onOpenIntegrations: vi.fn(),
  };

  it("renders the Platform Health section", () => {
    render(<SystemPanel {...mockProps} />);
    expect(screen.getByText(/Platform Health/i)).toBeInTheDocument();
  });

  it("renders the System Backbone status", () => {
    render(<SystemPanel {...mockProps} />);
    expect(screen.getByText(/System Backbone/i)).toBeInTheDocument();
    expect(screen.getByText(/LLM Mesh/i)).toBeInTheDocument();
  });

  it("renders telemetry data", () => {
    render(<SystemPanel {...mockProps} />);
    expect(screen.getByText(/Throughput/i)).toBeInTheDocument();
  });
});
