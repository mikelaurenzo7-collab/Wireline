import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CUSTOMER_SURFACES = [
  "src/**/*.{ts,tsx}",
  "api/**/*.ts",
  "apps/browser-extension/**/*.{html,js,json}",
  "android/app/src/main/**/*.{kt,xml}",
  "ios/Wireline/**/*.{swift,plist}",
  "ios/WirelineWidgets/**/*.{swift,plist}",
  "public/**/*.{html,json,svg,xml,txt}",
  "index.html",
  "server.ts",
];

const INVALID_BRAND_CASING = /\bBotbound\b|\bBot Bound\b/g;

describe("BotBound canonical brand casing", () => {
  it("does not ship common BotBound name variants on customer or runtime surfaces", () => {
    const violations: string[] = [];
    const files = globSync(CUSTOMER_SURFACES, {
      cwd: process.cwd(),
      exclude: ["tests/**", "dist/**", "node_modules/**"],
    });

    for (const path of files) {
      const source = readFileSync(path, "utf8");
      const lines = source.split("\n");
      for (let index = 0; index < lines.length; index += 1) {
        if (INVALID_BRAND_CASING.test(lines[index])) {
          violations.push(`${path}:${index + 1}: ${lines[index].trim()}`);
        }
        INVALID_BRAND_CASING.lastIndex = 0;
      }
    }

    expect(violations).toEqual([]);
  });
});
