// User-journey persistence tests. The default-fallback path on missing rows
// is the most error-prone surface — a regression there blocks new-user
// onboarding for everyone.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("./supabase", () => ({
  supabase: { from },
}));

import {
  getUserPreferences,
  updateUserPreferences,
  trackOnboardingStep,
  getOnboardingProgress,
} from "./user-journey";

const USER_ID = "user-1";

beforeEach(() => {
  from.mockReset();
});

describe("getUserPreferences", () => {
  it("returns the row from supabase when present", async () => {
    const row = {
      user_id: USER_ID,
      tour_completed: true,
      onboarding_completed: true,
      help_enabled: false,
      keyboard_shortcuts_enabled: true,
      preferences: { theme: "dark" },
    };
    from.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: row, error: null }),
        }),
      }),
    });
    const r = await getUserPreferences(USER_ID);
    expect(r).toEqual(row);
  });

  it("returns sensible defaults when no row exists (new user)", async () => {
    from.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: { code: "PGRST116" } }),
        }),
      }),
    });
    const r = await getUserPreferences(USER_ID);
    expect(r.user_id).toBe(USER_ID);
    expect(r.tour_completed).toBe(false);
    expect(r.onboarding_completed).toBe(false);
    expect(r.help_enabled).toBe(true);
    expect(r.keyboard_shortcuts_enabled).toBe(true);
    expect(r.preferences).toEqual({});
  });

  it("returns defaults when supabase returns an error", async () => {
    from.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: new Error("db down") }),
        }),
      }),
    });
    const r = await getUserPreferences(USER_ID);
    expect(r.tour_completed).toBe(false);
  });

  it("queries the correct table and column", async () => {
    from.mockReturnValue({
      select: () => ({
        eq: vi.fn().mockReturnValue({
          single: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    });
    await getUserPreferences(USER_ID);
    expect(from).toHaveBeenCalledWith("wireline_user_preferences");
  });
});

describe("updateUserPreferences", () => {
  it("upserts the user_id with the requested patch and an updated_at stamp", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    from.mockReturnValue({ upsert });
    await updateUserPreferences(USER_ID, { tour_completed: true });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        tour_completed: true,
        updated_at: expect.any(String),
      }),
    );
  });

  it("propagates upsert errors", async () => {
    from.mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ error: new Error("write failed") }),
    });
    await expect(updateUserPreferences(USER_ID, {})).rejects.toThrow("write failed");
  });
});

describe("trackOnboardingStep", () => {
  it("upserts a completed step with optional metadata", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    from.mockReturnValue({ upsert });
    const result = await trackOnboardingStep(USER_ID, "tour-1", { source: "modal" });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        step_id: "tour-1",
        completed: true,
        completed_at: expect.any(String),
        metadata: { source: "modal" },
      }),
    );
    expect(result.completed).toBe(true);
  });

  it("defaults metadata to an empty object when not provided", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    from.mockReturnValue({ upsert });
    await trackOnboardingStep(USER_ID, "step-x");
    const arg = upsert.mock.calls[0][0];
    expect(arg.metadata).toEqual({});
  });

  it("propagates write errors", async () => {
    from.mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ error: new Error("rls violation") }),
    });
    await expect(trackOnboardingStep(USER_ID, "step")).rejects.toThrow("rls violation");
  });
});

describe("getOnboardingProgress", () => {
  it("reduces step rows into a step_id->completed map", async () => {
    from.mockReturnValue({
      select: () => ({
        eq: () =>
          Promise.resolve({
            data: [
              { step_id: "tour-1", completed: true },
              { step_id: "tour-2", completed: false },
              { step_id: "tour-3", completed: true },
            ],
            error: null,
          }),
      }),
    });
    const r = await getOnboardingProgress(USER_ID);
    expect(r).toEqual({ "tour-1": true, "tour-2": false, "tour-3": true });
  });

  it("returns an empty map on database error", async () => {
    from.mockReturnValue({
      select: () => ({
        eq: () => Promise.resolve({ data: null, error: new Error("nope") }),
      }),
    });
    const r = await getOnboardingProgress(USER_ID);
    expect(r).toEqual({});
  });

  it("returns an empty map when no rows exist", async () => {
    from.mockReturnValue({
      select: () => ({
        eq: () => Promise.resolve({ data: [], error: null }),
      }),
    });
    expect(await getOnboardingProgress(USER_ID)).toEqual({});
  });
});
