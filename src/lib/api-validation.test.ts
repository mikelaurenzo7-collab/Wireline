import { describe, expect, it } from "vitest";
import { resetPasswordSchema } from "./api-validation";

describe("api validation", () => {
  it("accepts reset password with password", () => {
    const parsed = resetPasswordSchema.safeParse({ token: "tok", password: "Password1" });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({ token: "tok", password: "Password1" });
    }
  });

  it("accepts reset password with new_password alias", () => {
    const parsed = resetPasswordSchema.safeParse({ token: "tok", new_password: "Password1" });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({ token: "tok", password: "Password1" });
    }
  });
});
