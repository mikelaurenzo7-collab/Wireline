import { describe, it, expect } from "vitest";
import {
  DIRECTOR_STUB_REPLY,
  collapseDirectorThreadDuplicates,
  isDirectorStubReply,
  isSubstantiveDirectorReply,
} from "./director-reply-utils";

describe("director-reply-utils", () => {
  it("detects stub and substantive replies", () => {
    expect(isDirectorStubReply(DIRECTOR_STUB_REPLY)).toBe(true);
    expect(isSubstantiveDirectorReply(DIRECTOR_STUB_REPLY)).toBe(false);
    expect(isSubstantiveDirectorReply("x".repeat(200))).toBe(true);
  });

  it("collapses stub director rows after substantive reply for same operator turn", () => {
    const good = "A".repeat(200);
    const thread = collapseDirectorThreadDuplicates([
      { role: "operator", content: "Build me a website" },
      { role: "director", content: good },
      { role: "director", content: DIRECTOR_STUB_REPLY },
    ]);
    expect(thread).toHaveLength(2);
    expect(thread[1].content).toBe(good);
  });
});
