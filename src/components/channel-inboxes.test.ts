import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const emailSrc = fs.readFileSync(path.resolve(__dirname, "EmailInbox.tsx"), "utf8");
const smsSrc = fs.readFileSync(path.resolve(__dirname, "SmsThreads.tsx"), "utf8");

describe("Channel inbox accessibility structure", () => {
  it("gives email threads listbox semantics and arrow-key navigation", () => {
    expect(emailSrc).toContain('role="listbox"');
    expect(emailSrc).toContain('role="option"');
    expect(emailSrc).toContain("aria-selected={active}");
    expect(emailSrc).toContain("resolveChannelListNavigationIndex");
  });

  it("gives SMS threads listbox semantics and arrow-key navigation", () => {
    expect(smsSrc).toContain('role="listbox"');
    expect(smsSrc).toContain('role="option"');
    expect(smsSrc).toContain("aria-selected={activeId === t.id}");
    expect(smsSrc).toContain("resolveChannelListNavigationIndex");
  });
});
