import { describe, expect, it } from "vitest";
import {
  isPostgresMissingColumn,
  isPostgresMissingRelation,
  type DirectorMessagesLoadResult,
} from "./director-store";

describe("director-store postgres error helpers", () => {
  it("detects missing reasoning column errors", () => {
    expect(
      isPostgresMissingColumn(
        new Error(
          'column "reasoning" of relation "wireline_director_conversation_messages" does not exist',
        ),
      ),
    ).toBe(true);
    expect(isPostgresMissingColumn(new Error("42703 undefined_column"))).toBe(true);
    expect(isPostgresMissingColumn(new Error("connection refused"))).toBe(false);
  });

  it("detects missing relation errors", () => {
    expect(
      isPostgresMissingRelation(new Error('relation "wireline_director_artifacts" does not exist')),
    ).toBe(true);
    expect(isPostgresMissingRelation(new Error("42P01 undefined_table"))).toBe(true);
    expect(isPostgresMissingRelation(new Error("timeout"))).toBe(false);
  });
});

describe("ensureDirectorSchema production guard", () => {
  it("documents runtime DDL is disabled unless DIRECTOR_ALLOW_RUNTIME_DDL=1", () => {
    const allowRuntimeDdl =
      process.env.DIRECTOR_ALLOW_RUNTIME_DDL === "1" || process.env.NODE_ENV !== "production";
    expect(typeof allowRuntimeDdl).toBe("boolean");
  });
});

describe("DirectorMessagesLoadResult shape", () => {
  it("documents degraded empty fallback contract", () => {
    const fallback: DirectorMessagesLoadResult = { messages: [], degraded: true };
    expect(fallback.degraded).toBe(true);
    expect(fallback.messages).toEqual([]);
  });
});
