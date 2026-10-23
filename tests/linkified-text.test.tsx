import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import LinkifiedText from "../src/components/ui/LinkifiedText";

describe("message web links", () => {
  it("keeps punctuation and balanced parentheses outside the correct destination", () => {
    const html = renderToStaticMarkup(
      <LinkifiedText>
        {"Plans: https://botbound.app/pricing. (See https://example.com/a_(b))."}
      </LinkifiedText>,
    );
    expect(html).toContain('href="https://botbound.app/pricing"');
    expect(html).toContain('href="https://example.com/a_(b)"');
    expect(html).toContain("</a>).");
    expect(html).toContain('rel="noopener noreferrer nofollow"');
  });

  it("renders untrusted message markup as text and rejects credential links", () => {
    const html = renderToStaticMarkup(
      <LinkifiedText>
        {
          "<img src=x onerror=alert(1)> javascript:alert(1) data:text/html,test https://user:pass@example.com/private https://"
        }
      </LinkifiedText>,
    );
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<a ");
    expect(html).toContain("https://user:pass@example.com/private");
  });
});
