import { describe, expect, it } from "vitest";
import { safeSvgPreviewDataUrl } from "./sanitize-svg-preview";

describe("safeSvgPreviewDataUrl", () => {
  it("accepts a minimal svg and returns a data URL", () => {
    const url = safeSvgPreviewDataUrl(
      '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>',
    );
    expect(url).toMatch(/^data:image\/svg\+xml,/);
  });

  it("rejects script tags", () => {
    expect(safeSvgPreviewDataUrl("<svg><script>alert(1)</script></svg>")).toBeNull();
  });

  it("rejects event handlers", () => {
    expect(safeSvgPreviewDataUrl('<svg onload="alert(1)"></svg>')).toBeNull();
  });

  it("rejects non-svg content", () => {
    expect(safeSvgPreviewDataUrl("<div>not svg</div>")).toBeNull();
  });
});
