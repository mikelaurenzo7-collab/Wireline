import { describe, it, expect } from "vitest";
import { drizzle } from "../lib/server-context";
import { authService } from "../lib/auth-service";

describe("TC-001: Express Server Initialization", () => {
  it("should have a valid configuration for the Express server", () => {
    expect(process.env.NODE_ENV).toBeDefined();
  });
});

describe("TC-002: Drizzle & Local Auth validation", () => {
  it("should successfully initialize the Drizzle client", () => {
    expect(drizzle).toBeDefined();
  });

  it("should have a functional auth service", () => {
    expect(authService).toBeDefined();
    expect(authService.signIn).toBeTypeOf("function");
    expect(authService.signUp).toBeTypeOf("function");
  });
});

import twilio from "twilio";

describe("TC-003: Twilio SDK", () => {
  it("twilio package exports a callable factory", () => {
    expect(typeof twilio).toBe("function");
  });
});
