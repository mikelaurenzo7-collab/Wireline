import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkspaceOperateIntro } from "../src/components/layout/WorkspacePageFrame";

describe("operate page heading hierarchy", () => {
  it("keeps one accessible Calls heading while bringing controls to the top on every screen", () => {
    const html = renderToStaticMarkup(
      <WorkspaceOperateIntro
        title="Calls"
        titleHidden
        tabs={
          <nav aria-label="Call sections">
            <button>Lines</button>
          </nav>
        }
      />,
    );

    expect(html).toContain('<h1 class="sr-only">Calls</h1>');
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain('<nav aria-label="Call sections"><button>Lines</button></nav>');
    expect(html).not.toContain("lg:sr-only");
    expect(html).not.toContain("mt-3");
    expect(html).not.toContain("items-end");
  });

  it("retains an accessible heading without an empty title bar when no controls are needed", () => {
    expect(renderToStaticMarkup(<WorkspaceOperateIntro title="Activity" titleHidden />)).toBe(
      '<h1 class="sr-only">Activity</h1>',
    );
  });

  it("keeps contextual titles visible when navigation does not provide the page name", () => {
    const html = renderToStaticMarkup(<WorkspaceOperateIntro title="Call Details" />);
    expect(html).toContain('<h1 class="wl-display-3 break-words text-balance">Call Details</h1>');
    expect(html).not.toContain("sr-only");
  });

  it("preserves a page action and spacing above controls when the title is hidden", () => {
    const html = renderToStaticMarkup(
      <WorkspaceOperateIntro
        title="Calls"
        titleHidden
        action={<button>Start a Call</button>}
        tabs={<nav aria-label="Call sections">History</nav>}
      />,
    );
    expect(html).toContain('<h1 class="sr-only">Calls</h1>');
    expect(html).toContain("justify-end");
    expect(html).toContain("<button>Start a Call</button>");
    expect(html).toContain('<div class="mt-3"><nav aria-label="Call sections">History</nav></div>');
  });
});
