import { describe, expect, it } from "vitest";
import { countStyleProps, countStyleTags, stripComments } from "./csp-inventory";

describe("csp-inventory", () => {
  it("stripComments removes line and block comments", () => {
    const src = `
      // style={ in comment only
      /* style={ block */
      const x = 1;
    `;
    expect(stripComments(src)).not.toContain("style={");
    expect(stripComments(src)).toContain("const x = 1");
  });

  it("countStyleProps ignores style={ in comments", () => {
    const src = `
      // style={ doc example
      export function Foo() {
        return <div className="x" />;
      }
    `;
    expect(countStyleProps(src)).toBe(0);
  });

  it("countStyleProps counts real JSX style props", () => {
    const src = `export function Foo() { return <div style={{ color: "red" }} />; }`;
    expect(countStyleProps(src)).toBe(1);
  });

  it("countStyleTags ignores <style in comments", () => {
    const src = `
      /** Renders <style> in docs only */
      export function Foo() { return <span />; }
    `;
    expect(countStyleTags(src)).toBe(0);
  });

  it("countStyleTags counts JSX style children", () => {
    const src = `export function Foo() { return <><style>{"x{}"}</style></>; }`;
    expect(countStyleTags(src)).toBe(1);
  });
});
