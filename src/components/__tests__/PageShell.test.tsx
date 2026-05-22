import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PageShell, { Panel, StatTile } from "../PageShell";

describe("PageShell", () => {
  it("does not paint the in-page title/subtitle block (removed per design)", () => {
    // The eyebrow + title + caption header was removed — the left nav
    // labels the page. The props are still accepted (callers + doc
    // title) but must not render as visible page chrome.
    render(<PageShell title="Voice Archive" subtitle="All recorded calls" />);
    expect(screen.queryByText("Voice Archive")).not.toBeInTheDocument();
    expect(screen.queryByText("All recorded calls")).not.toBeInTheDocument();
  });

  it("does not paint the eyebrow", () => {
    render(<PageShell title="Insights" eyebrow="Signal · Analytics" />);
    expect(screen.queryByText("Signal · Analytics")).not.toBeInTheDocument();
  });

  it("renders children when no tabs are provided", () => {
    render(
      <PageShell title="Test">
        <div>Child content</div>
      </PageShell>,
    );
    expect(screen.getByText("Child content")).toBeInTheDocument();
  });

  it("renders tab strip when tabs are provided", () => {
    const tabs = [
      { id: "a", label: "Alpha", content: <div>Alpha content</div> },
      { id: "b", label: "Beta", content: <div>Beta content</div> },
    ];
    render(<PageShell title="Tabbed" tabs={tabs} />);
    // Desktop + mobile strips both render — each label appears twice.
    expect(screen.getAllByText("Alpha").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Beta").length).toBeGreaterThan(0);
  });

  it("shows the first tab's content by default", () => {
    const tabs = [
      { id: "a", label: "Alpha", content: <div>Alpha content</div> },
      { id: "b", label: "Beta", content: <div>Beta content</div> },
    ];
    render(<PageShell title="Tabbed" tabs={tabs} />);
    expect(screen.getByText("Alpha content")).toBeInTheDocument();
    expect(screen.queryByText("Beta content")).not.toBeInTheDocument();
  });

  it("switches to another tab on click", () => {
    const tabs = [
      { id: "a", label: "Alpha", content: <div>Alpha content</div> },
      { id: "b", label: "Beta", content: <div>Beta content</div> },
    ];
    render(<PageShell title="Tabbed" tabs={tabs} />);
    // Click first occurrence of "Beta" (desktop strip renders first).
    fireEvent.click(screen.getAllByText("Beta")[0]);
    expect(screen.getByText("Beta content")).toBeInTheDocument();
    expect(screen.queryByText("Alpha content")).not.toBeInTheDocument();
  });

  it("renders actions slot", () => {
    render(<PageShell title="Test" actions={<button>Export</button>} />);
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
  });

  it("respects defaultTab", () => {
    const tabs = [
      { id: "a", label: "Alpha", content: <div>Alpha content</div> },
      { id: "b", label: "Beta", content: <div>Beta content</div> },
    ];
    render(<PageShell title="Tabbed" tabs={tabs} defaultTab="b" />);
    expect(screen.getByText("Beta content")).toBeInTheDocument();
    expect(screen.queryByText("Alpha content")).not.toBeInTheDocument();
  });

  it("shows tab badge when provided", () => {
    const tabs = [{ id: "a", label: "Inbox", badge: 5, content: <div>content</div> }];
    render(<PageShell title="Test" tabs={tabs} />);
    // Badge appears in both desktop + mobile strips.
    expect(screen.getAllByText("5").length).toBeGreaterThan(0);
  });
});

describe("Panel", () => {
  it("renders children", () => {
    render(
      <Panel>
        <div>Panel content</div>
      </Panel>,
    );
    expect(screen.getByText("Panel content")).toBeInTheDocument();
  });

  it("renders title when provided", () => {
    render(
      <Panel title="My Panel">
        <div>child</div>
      </Panel>,
    );
    expect(screen.getByText("My Panel")).toBeInTheDocument();
  });

  it("renders actions slot", () => {
    render(
      <Panel title="P" actions={<button>Action</button>}>
        <div>x</div>
      </Panel>,
    );
    expect(screen.getByRole("button", { name: "Action" })).toBeInTheDocument();
  });

  it("renders hint text alongside title", () => {
    render(
      <Panel title="P" hint="LIVE">
        <div>x</div>
      </Panel>,
    );
    expect(screen.getByText("LIVE")).toBeInTheDocument();
  });
});

describe("StatTile", () => {
  it("renders label and value", () => {
    render(<StatTile label="Total Calls" value="1,024" />);
    expect(screen.getByText("Total Calls")).toBeInTheDocument();
    expect(screen.getByText("1,024")).toBeInTheDocument();
  });

  it("renders sub text when provided", () => {
    render(<StatTile label="Revenue" value="$42k" sub="+12% vs last month" />);
    expect(screen.getByText("+12% vs last month")).toBeInTheDocument();
  });
});
