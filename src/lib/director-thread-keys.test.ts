import { describe, expect, it } from "vitest";
import {
  DIRECTOR_THREAD_KEY,
  PAINTER_THREAD_KEY,
  parseDirectorThreadKey,
} from "./director-thread-keys";

describe("director-thread-keys", () => {
  it("defaults unknown values to director", () => {
    expect(parseDirectorThreadKey(undefined)).toBe(DIRECTOR_THREAD_KEY);
    expect(parseDirectorThreadKey("")).toBe(DIRECTOR_THREAD_KEY);
    expect(parseDirectorThreadKey("fleet")).toBe(DIRECTOR_THREAD_KEY);
  });

  it("parses painter thread", () => {
    expect(parseDirectorThreadKey(PAINTER_THREAD_KEY)).toBe(PAINTER_THREAD_KEY);
    expect(parseDirectorThreadKey("painter")).toBe(PAINTER_THREAD_KEY);
  });
});
