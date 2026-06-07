import { describe, expect, it } from "vitest";
import {
  extractStitchInlineHtml,
  extractStitchInlineImage,
  extractStitchProjectId,
  extractStitchProjects,
  mergeStitchScreenRecord,
  pickCompatibleStitchProject,
  extractStitchScreens,
  isLikelyStitchPlaceholderImage,
  isPolishedStitchHtml,
  stitchScreenAssetsReady,
} from "./google-stitch-mcp-client";

describe("google stitch mcp parsing", () => {
  it("extracts project and screen ids from nested payloads", () => {
    const payload = {
      screens: [
        {
          screenId: "9876543210",
          projectId: "projects/1234567890",
          screenshot: { downloadUrl: "https://storage.googleapis.com/x.png" },
          htmlCode: { downloadUrl: "https://storage.googleapis.com/x.html" },
        },
      ],
    };
    expect(extractStitchProjectId(payload)).toBe("1234567890");
    expect(extractStitchScreens(payload)).toHaveLength(1);
    expect(extractStitchScreens(payload)[0]?.screenId).toBe("9876543210");
  });

  it("extracts screens from Stitch resource names", () => {
    const screens = extractStitchScreens({
      screens: [{ name: "projects/1234567890/screens/9876543210" }],
    });
    expect(screens).toHaveLength(1);
    expect(screens[0]?.screenId).toBe("9876543210");
    expect(screens[0]?.projectId).toBe("1234567890");
  });

  it("extracts inline HTML and base64 screenshot payloads", () => {
    const html = extractStitchInlineHtml({ html: "<html><body>Hi</body></html>" });
    expect(html?.toString("utf8")).toContain("<body>Hi</body>");
    const pngBytes = Buffer.alloc(96, 0xab);
    const image = extractStitchInlineImage({ image: pngBytes.toString("base64") });
    expect(image?.equals(pngBytes)).toBe(true);
  });

  it("merges flat get_screen payloads", () => {
    const merged = mergeStitchScreenRecord(
      { screenId: "42" },
      {
        htmlCode: { downloadUrl: "https://storage.googleapis.com/a.html" },
        screenshot: { downloadUrl: "https://storage.googleapis.com/a.png" },
      },
    );
    expect(merged.htmlCode).toBeDefined();
    expect(merged.screenshot).toBeDefined();
  });

  it("extracts UUID-style screen ids from resource names", () => {
    const screens = extractStitchScreens({
      screens: [{ name: "projects/4044680601076201931/screens/98b50e2ddc9943efb387052637738f61" }],
    });
    expect(screens).toHaveLength(1);
    expect(screens[0]?.screenId).toBe("98b50e2ddc9943efb387052637738f61");
    expect(screens[0]?.projectId).toBe("4044680601076201931");
  });

  it("waits for polished assets before packaging previews", () => {
    const grid = Buffer.alloc(4_000);
    const wireframe = Buffer.from(
      "<!DOCTYPE html><html><body>" +
        "<a href='/'>Home</a><a href='/about'>About</a><a href='/contact'>Contact</a>" +
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
    const png = Buffer.alloc(120_000);

    expect(isLikelyStitchPlaceholderImage(grid)).toBe(true);
    expect(isLikelyStitchPlaceholderImage(png)).toBe(false);
    expect(isPolishedStitchHtml(wireframe)).toBe(false);
    expect(isPolishedStitchHtml(polishedHtml)).toBe(true);
    expect(stitchScreenAssetsReady({ image: grid })).toBe(false);
    expect(stitchScreenAssetsReady({ image: grid }, { allowImageFallback: true })).toBe(false);
    expect(stitchScreenAssetsReady({ html: wireframe })).toBe(false);
    expect(stitchScreenAssetsReady({ html: polishedHtml })).toBe(true);
    expect(stitchScreenAssetsReady({ image: png })).toBe(true);
    expect(stitchScreenAssetsReady({ image: png }, { allowImageFallback: true })).toBe(true);
  });

  it("prefers TEXT_TO_UI_PRO when listing projects", () => {
    const projects = extractStitchProjects({
      projects: [
        { projectId: "111", projectType: "PROJECT_DESIGN", title: "MCP stub" },
        { projectId: "222", projectType: "TEXT_TO_UI_PRO", title: "Wireline" },
      ],
    });
    expect(pickCompatibleStitchProject(projects)?.projectId).toBe("222");
  });
});
