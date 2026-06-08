import { describe, expect, it } from "vitest";
import { isDesignProfileConfigured, validateDesignProfileUpload } from "./design-profile";

describe("design-profile", () => {
  it("detects configured profiles", () => {
    expect(isDesignProfileConfigured({ companyBlurb: "Acme" })).toBe(true);
    expect(isDesignProfileConfigured({ styleNotes: "Bold palette" })).toBe(true);
    expect(isDesignProfileConfigured({ assets: [{ id: "1" }] })).toBe(true);
    expect(isDesignProfileConfigured({ tokenManifest: { colors: ["#E85D04"] } })).toBe(true);
    expect(isDesignProfileConfigured({})).toBe(false);
  });

  it("rejects blocked file types", () => {
    const result = validateDesignProfileUpload({
      fileName: "brand.fig",
      mimeType: "application/octet-stream",
      data: Buffer.from("x"),
    });
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toMatch(/not supported/i);
    }
  });

  it("accepts png uploads", () => {
    const result = validateDesignProfileUpload({
      fileName: "logo.png",
      mimeType: "image/png",
      data: Buffer.from("png"),
    });
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.mimeType).toBe("image/png");
    }
  });
});
