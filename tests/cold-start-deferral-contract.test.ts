import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd());
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(root, dir))) {
    const rel = `${dir}/${entry}`;
    if (statSync(join(root, rel)).isDirectory()) walk(rel, out);
    else if (/\.tsx?$/.test(entry)) out.push(rel);
  }
  return out;
}

// vercel.json routes every /api/:path* through one serverless function, so any
// module-scope import in the server graph is paid on EVERY cold start — a
// Stripe webhook, a Twilio callback, a health probe — whether or not the
// request touches that dependency. googleapis measured ~1,300 ms and ~1,000
// modules on its own; deferring it took the bundle from 1,627 ms / 1,896
// modules to 660 ms / 937.
describe("googleapis stays off the cold-start path", () => {
  const sources = walk("src").filter((f) => !f.includes("/__tests__/"));

  it("is never imported at module scope", () => {
    const offenders = sources.filter((file) => {
      const src = read(file);
      // A static import of the package anywhere in the server graph re-hoists
      // it. `import type` is erased at build time and is fine.
      return /^\s*import\s+(?!type\b)[^;]*from\s+["']googleapis["']/m.test(src);
    });
    expect(offenders).toEqual([]);
  });

  it("routes every consumer through the lazy accessor", () => {
    const accessor = read("src/lib/google-apis.ts");
    expect(accessor).toContain('await import("googleapis")');
    // Cached, so the cost is paid once per process rather than per call.
    expect(accessor).toContain("if (!cached)");

    // Every file that actually uses a Google client resolves it locally.
    const consumers = sources.filter(
      (f) =>
        f !== "src/lib/google-apis.ts" &&
        /\bgoogle\.(auth|gmail|calendar|drive|oauth2)\b/.test(read(f)),
    );
    expect(consumers.length).toBeGreaterThanOrEqual(5);
    for (const file of consumers) {
      expect(read(file), file).toContain("googleApis()");
    }
  });

  it("keeps the OAuth client builders async", () => {
    // These are the two sync helpers the deferral had to convert; a revert to
    // sync would force a static import back in.
    const helpers = read("src/lib/oauth-helpers.ts");
    expect(helpers).toMatch(/export async function getGoogleOAuthClient/);
    expect(helpers).toMatch(/export async function buildOAuthClient/);
  });
});
