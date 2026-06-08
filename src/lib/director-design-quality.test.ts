import { describe, expect, it } from "vitest";
import { isPolishedDesignHtml } from "./director-design-quality";

describe("director design quality", () => {
  it("rejects wireframe HTML and accepts polished embedded CSS", () => {
    const wireframe = Buffer.from(
      "<!DOCTYPE html><html><body>" +
        "<a href='/pricing'>Pricing</a><a href='/blog'>Blog</a><a href='/login'>Login</a>" +
        "</body></html>",
    );
    const polishedHtml = Buffer.from(
      "<!DOCTYPE html><html><head><style>body{font-family:sans-serif;color:#111;background:#f5f0e8}" +
        "a{color:inherit;text-decoration:none}main{padding:2rem}</style></head><body><main>" +
        "Ready for preview with enough bytes and real embedded styling for the client UI. ".repeat(
          40,
        ) +
        "</main></body></html>",
    );

    expect(isPolishedDesignHtml(wireframe)).toBe(false);
    expect(isPolishedDesignHtml(polishedHtml)).toBe(true);
  });
});
