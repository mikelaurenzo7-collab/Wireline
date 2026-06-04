import { describe, it, expect } from "vitest";
import { DNC_IMPORT_MAX_ENTRIES, dncImportLimitError } from "./dnc-import-limits";

describe("dncImportLimitError", () => {
  it("allows imports within the cap", () => {
    expect(dncImportLimitError(DNC_IMPORT_MAX_ENTRIES)).toBeNull();
    expect(dncImportLimitError(1)).toBeNull();
  });

  it("rejects imports above the cap with a clear message", () => {
    const err = dncImportLimitError(DNC_IMPORT_MAX_ENTRIES + 1);
    expect(err).toMatch(/5,?000/);
    expect(err).toMatch(/maximum/i);
  });
});
