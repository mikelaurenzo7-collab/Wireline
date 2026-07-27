import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const oauthCallbackRoutes = [
  "src/routes/oauth/apollo.ts",
  "src/routes/oauth/hubspot.ts",
  "src/routes/oauth/meta.ts",
  "src/routes/oauth/microsoft-graph.ts",
  "src/routes/oauth/microsoft.ts",
  "src/routes/oauth/salesforce.ts",
  "src/routes/oauth/shopify.ts",
  "src/routes/oauth/slack.ts",
  "src/routes/oauth/square.ts",
  "src/routes/oauth/x.ts",
  "src/routes/oauth/yahoo.ts",
  "src/routes/oauth/zoom.ts",
] as const;

describe("OAuth provider-error responses", () => {
  it("logs provider detail without reflecting it into an HTML response", () => {
    const reflectedProviderError =
      /\.send\(\s*`[^`]*\$\{(?:error|error_description|oauthError)\b/;

    for (const path of oauthCallbackRoutes) {
      const source = read(path);
      expect(source, path).not.toMatch(reflectedProviderError);
      expect(source, path).toContain('.type("text/plain")');
      expect(source, path).toContain("authorization was not completed");
    }
  });
});
