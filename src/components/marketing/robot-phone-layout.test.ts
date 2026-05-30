import { describe, expect, it } from "vitest";
import {
  phoneLayoutForGutter,
  phoneOverlapsHead,
  ROBOT_HEAD_LEFT,
  ROBOT_HEAD_RIGHT,
  ROBOT_PHONE_W,
} from "./robot-phone-layout";

describe("phoneLayoutForGutter", () => {
  it("left gutter places phone on the right cheek (toward page center)", () => {
    const layout = phoneLayoutForGutter("left", "phone");
    expect(layout.phoneSide).toBe("right");
    expect(layout.phoneOffset).toBe(ROBOT_HEAD_RIGHT - 7);
    expect(phoneOverlapsHead(layout.phoneOffset)).toBe(true);
    expect(layout.phoneOffset + ROBOT_PHONE_W).toBeGreaterThan(ROBOT_HEAD_RIGHT - 2);
  });

  it("right gutter places phone on the left cheek (toward page center)", () => {
    const layout = phoneLayoutForGutter("right", "phone");
    expect(layout.phoneSide).toBe("left");
    expect(layout.phoneOffset).toBe(ROBOT_HEAD_LEFT - ROBOT_PHONE_W + 7);
    expect(phoneOverlapsHead(layout.phoneOffset)).toBe(true);
    expect(layout.phoneOffset).toBeLessThan(ROBOT_HEAD_LEFT + 2);
  });

  it("on-call pose uses a slightly higher phoneY than idle phone pose", () => {
    expect(phoneLayoutForGutter("left", "on-call").phoneY).toBe(19);
    expect(phoneLayoutForGutter("left", "phone").phoneY).toBe(20);
  });
});

describe("phoneOverlapsHead", () => {
  it("rejects phones floating fully outside the head shell", () => {
    expect(phoneOverlapsHead(0)).toBe(false);
    expect(phoneOverlapsHead(60)).toBe(false);
  });
});
