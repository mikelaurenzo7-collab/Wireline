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
  it.each([
    {
      report: "1. Answer Calls.\n\n2. Follow Up by Email.\n\n3. Research in the Browser.",
      starts: ["1", "2", "3"],
      items: 3,
    },
    {
      report: "7) Review Findings.\n8) Share the Results.",
      starts: ["7"],
      items: 2,
    },
  ])(
    "preserves source numbering across result paragraphs: $starts",
    ({ report, starts, items }) => {
      const html = renderToStaticMarkup(<TaskResultText>{report}</TaskResultText>);
      expect([...html.matchAll(/<ol start="(\d+)">/g)].map((match) => match[1])).toEqual(starts);
      expect(html.match(/<li>/g)).toHaveLength(items);
    },
  );

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
