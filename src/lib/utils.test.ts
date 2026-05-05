import { describe, it, expect } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("returns a single class unchanged", () => {
    expect(cn("foo")).toBe("foo");
  });

  it("joins multiple classes", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("ignores falsy values", () => {
    expect(cn("foo", false, undefined, null, "", "bar")).toBe("foo bar");
  });

  it("merges conflicting Tailwind classes — last wins", () => {
    // twMerge ensures only the last padding wins
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("handles conditional class objects", () => {
    expect(cn({ active: true, disabled: false })).toBe("active");
    expect(cn({ active: false, visible: true })).toBe("visible");
  });

  it("handles arrays", () => {
    expect(cn(["foo", "bar"])).toBe("foo bar");
  });

  it("handles deeply nested arrays and objects", () => {
    expect(cn(["foo", { bar: true }], "baz")).toBe("foo bar baz");
  });

  it("deduplicates Tailwind utilities that cover the same property", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });

  it("returns empty string when given no truthy inputs", () => {
    expect(cn(false, undefined, null)).toBe("");
  });
});
