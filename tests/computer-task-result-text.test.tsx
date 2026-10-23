import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import TaskResultText from "../src/components/computer/TaskResultText";

describe("Computer result text", () => {
  it("renders useful emphasis, lists and explicit public links", () => {
    const html = renderToStaticMarkup(
      <TaskResultText>
        {"**Result**\n\n- First source\n- [Public page](https://example.com/proof)"}
      </TaskResultText>,
    );
    expect(html).toContain("<strong>Result</strong>");
    expect(html).toContain("<ul>");
    expect(html).toContain('href="https://example.com/proof"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
  });
  it("never interprets model HTML or credential-bearing links", () => {
    const html = renderToStaticMarkup(
      <TaskResultText>
        {
          '<img src=x onerror="alert(1)">\n\n[click](javascript:alert(1))\n\n[private](https://user:secret@example.com/)'
        }
      </TaskResultText>,
    );
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<a");
    expect(html).toContain("&lt;img");
  });
});
