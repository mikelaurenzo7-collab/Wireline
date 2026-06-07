import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.resolve(__dirname, "DirectorWorkspace.tsx"), "utf8");

describe("DirectorWorkspace Stitch polling structure", () => {
  it("finalizes a specific render id with persisted device and operator context", () => {
    expect(src).toContain('authFetch("/api/director/stitch/finalize"');
    expect(src).toContain("renderId: session.renderId");
    expect(src).toContain("operatorMessage: operatorMessage || session.operatorMessage");
    expect(src).toContain("deviceType: session.deviceType");
  });

  it("keeps long-running renders recoverable instead of clearing pending state", () => {
    expect(src).toContain("Array.from({ length: 48 }, () => 30_000)");
    expect(src).toContain("setStitchPollExhausted((prev) => ({ ...prev, [message.id]: true }))");
    expect(src).toContain("Check again for preview");
    expect(src).not.toContain("stitchAssetsPending: false } : m");
  });

  it("guards stale Stitch polls when a thread is cleared or unmounted", () => {
    expect(src).toContain("stitchThreadVersionRef.current += 1");
    expect(src).toContain("stitchPollRef.current.clear()");
    expect(src).toContain("stitchThreadVersionRef.current !== threadVersion");
  });
});
