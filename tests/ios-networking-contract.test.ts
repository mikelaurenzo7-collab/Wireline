import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const configSource = read("ios/Wireline/Networking/WirelineConfig.swift");
const apiSource = read("ios/Wireline/Networking/WirelineAPI.swift");

describe("iOS networking contract", () => {
  it("builds endpoint URLs through URLComponents and typed query items", () => {
    expect(configSource).toContain("static func endpoint(");
    expect(configSource).toContain("[URLQueryItem]");
    expect(configSource).toContain("URLComponents(");
    expect(configSource).toContain("components.queryItems =");
    expect(configSource).toContain("inlineQueryOrFragment");
  });

  it("never embeds the recent-call query string in a path component", () => {
    expect(apiSource).not.toContain("/api/mobile/calls/recent?limit=");
    expect(apiSource).toContain('URLQueryItem(name: "limit"');
    expect(apiSource).toContain("let boundedLimit = min(max(limit, 1), 100)");
    expect(apiSource).toContain("WirelineConfig.endpoint(path: path, queryItems: queryItems)");
  });
});
