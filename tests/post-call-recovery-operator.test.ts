import { describe, expect, it } from "vitest";
import {
  assertPostCallRecoveryOperatorEnvironment,
  parsePostCallRecoveryArguments,
} from "../scripts/recover-post-call-finalization.mts";

const revision = "a".repeat(40);
const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const parentJobId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const args = ["--job-id", parentJobId, "--user-id", userId, "--expected-source", revision];
const env = {
  RENDER: "true",
  IS_PULL_REQUEST: "false",
  RENDER_GIT_BRANCH: "main",
  RENDER_GIT_COMMIT: revision,
  WIRELINE_DEPLOYMENT_ENVIRONMENT: "production",
  NODE_ENV: "production",
  APP_URL: "https://botbound.app",
};

describe("bounded post-call recovery operator", () => {
  it("defaults to read-only and requires one exact parent and owner", () => {
    expect(parsePostCallRecoveryArguments(args)).toEqual({
      parentJobId,
      userId,
      expectedSource: revision,
      apply: false,
    });
    expect(parsePostCallRecoveryArguments([...args, "--apply"]).apply).toBe(true);
  });
  it.each([
    [],
    args.slice(0, 4),
    [...args, "--all"],
    [...args, "--apply", "--apply"],
    [...args, "--job-id", parentJobId],
    ["--job-id", "../arbitrary", ...args.slice(2)],
    [...args.slice(0, 5), "main"],
    [...args.slice(0, 5), `${revision};echo unsafe`],
  ])("rejects missing, broad, duplicated or malformed arguments %#", (value) => {
    expect(() => parsePostCallRecoveryArguments(value)).toThrow();
  });
  it("accepts only the exact API artifact in production main", () => {
    expect(() =>
      assertPostCallRecoveryOperatorEnvironment(env, revision, { role: "api", revision }, revision),
    ).not.toThrow();
  });
  it.each([
    { RENDER: "false" },
    { IS_PULL_REQUEST: "true" },
    { WIRELINE_DEPLOYMENT_ENVIRONMENT: "preview" },
    { NODE_ENV: "development" },
    { RENDER_GIT_BRANCH: "feature" },
    { RENDER_GIT_COMMIT: "b".repeat(40) },
    { WIRELINE_SOURCE_REVISION: "b".repeat(40) },
    { WIRELINE_VOICE_WORKER: "true" },
    { VERCEL: "1", VERCEL_ENV: "production" },
    { APP_URL: "https://example.com" },
  ])("rejects ambiguous or wrong deployment identity %#", (override) => {
    expect(() =>
      assertPostCallRecoveryOperatorEnvironment(
        { ...env, ...override },
        revision,
        { role: "api", revision },
        revision,
      ),
    ).toThrow();
  });
  it.each([
    [{ role: "voice", revision }, revision],
    [{ role: "api", revision: "b".repeat(40) }, revision],
    [{ role: "api", revision }, "b".repeat(40)],
  ] as const)("rejects mismatched built or checked-out source %#", (release, checkout) => {
    expect(() =>
      assertPostCallRecoveryOperatorEnvironment(env, revision, release, checkout),
    ).toThrow();
  });
});
