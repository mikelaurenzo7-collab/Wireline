import { scryptSync } from "node:crypto";
import { getTableColumns, getTableName } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
type Predicate = (row: Row) => boolean;
type Selection = Record<string, { name: string }>;

const state = vi.hoisted(() => ({
  user: {} as Row,
  beforeSessionRead: null as (() => void) | null,
  beforePasswordWrite: null as (() => void) | null,
  afterSessionRead: null as (() => void) | null,
  failPasswordWrite: false,
  select: vi.fn(),
  update: vi.fn(),
  ensureAccount: vi.fn(),
}));

// A small conditional store executes the predicates supplied by the real
// sign-in service. Password writes model migration 0127's version trigger.
vi.mock("drizzle-orm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("drizzle-orm")>()),
  eq:
    (column: { name: string }, value: unknown): Predicate =>
    (row) =>
      row[column.name] === value,
  and:
    (...conditions: Predicate[]): Predicate =>
    (row) =>
      conditions.every((test) => test(row)),
}));

vi.mock("../src/lib/server-context", () => ({
  drizzle: { select: state.select, update: state.update },
  log: { warn: vi.fn(), error: vi.fn() },
  tenantStore: { run: (_userId: string, perform: () => unknown) => perform() },
}));
vi.mock("../src/lib/account-service", () => ({ ensureDefaultAccount: state.ensureAccount }));
vi.mock("../src/lib/account-type", () => ({ resolveAccountType: () => "personal" }));
vi.mock("../src/lib/breached-passwords", () => ({ assertPasswordIsSafe: vi.fn() }));

import { authService, hashPassword, verifyPassword } from "../src/lib/auth-service";
import { isSessionGenerationActive } from "../src/lib/session-generation";
import type { JwtPayload } from "../src/lib/auth-utils";

const PASSWORD = "old-passphrase-for-signin-test";
let strongHash: string;
let resetHash: string;
let legacyHash: string;

function project(row: Row, selection: Selection): Row {
  return Object.fromEntries(
    Object.entries(selection).map(([key, column]) => [key, row[column.name]]),
  );
}

function resetPassword() {
  state.user.password_hash = resetHash;
  state.user.session_version = Number(state.user.session_version) + 1;
}

function claims(token: string): JwtPayload {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
}

function isCurrentToken(token: string): boolean {
  return isSessionGenerationActive(claims(token), {
    sessionVersion: Number(state.user.session_version),
    sessionRevokedBefore: new Date(0),
  });
}

beforeAll(() => {
  strongHash = hashPassword(PASSWORD);
  resetHash = hashPassword("replacement-passphrase-for-reset-test");
  const salt = "00112233445566778899aabbccddeeff";
  legacyHash = `${salt}:${scryptSync(PASSWORD, salt, 64).toString("hex")}`;
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.INTERNAL_JWT_SECRET = "signin-race-test-secret-at-least-32-characters";
  state.user = {
    id: "00000000-0000-4000-8000-000000000001",
    email: "owner@example.com",
    full_name: "Owner",
    password_hash: strongHash,
    session_version: 4,
  };
  state.beforeSessionRead = null;
  state.beforePasswordWrite = null;
  state.afterSessionRead = null;
  state.failPasswordWrite = false;
  state.ensureAccount.mockImplementation(async () => {
    state.afterSessionRead?.();
    return { type: "personal" };
  });
  state.select.mockImplementation((selection?: Selection) => {
    let table: Parameters<typeof getTableName>[0];
    let predicate: Predicate = () => true;
    const query = {
      from(value: typeof table) {
        table = value;
        return query;
      },
      where(value: Predicate) {
        predicate = value;
        return query;
      },
      async limit() {
        if (getTableName(table) !== "wireline_users") return [];
        if (selection?.sessionVersion) state.beforeSessionRead?.();
        return predicate(state.user)
          ? [project(state.user, selection ?? getTableColumns(table))]
          : [];
      },
    };
    return query;
  });
  state.update.mockImplementation(() => {
    let values: Row = {};
    let predicate: Predicate = () => true;
    let result: Promise<Row[]> | undefined;
    const execute = () =>
      (result ??= Promise.resolve().then(() => {
        state.beforePasswordWrite?.();
        if (state.failPasswordWrite) throw new Error("temporary database error");
        if (!predicate(state.user)) return [];
        if (values.passwordHash !== state.user.password_hash) {
          state.user.password_hash = values.passwordHash;
          state.user.session_version = Number(state.user.session_version) + 1;
        }
        return [{ ...state.user }];
      }));
    const query = {
      set(value: Row) {
        values = value;
        return query;
      },
      where(value: Predicate) {
        predicate = value;
        return query;
      },
      async returning(selection: Selection) {
        return (await execute()).map((row) => project(row, selection));
      },
      then(resolve: (rows: Row[]) => unknown, reject?: (error: unknown) => unknown) {
        return execute().then(resolve, reject);
      },
    };
    return query;
  });
});

describe("sign-in racing password recovery", () => {
  it("signs in with the current password and current session generation", async () => {
    const result = await authService.signIn("owner@example.com", PASSWORD);
    expect(result).not.toBeNull();
    expect(isCurrentToken(result!.token)).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    expect(await authService.signIn("owner@example.com", "incorrect")).toBeNull();
    expect(state.ensureAccount).not.toHaveBeenCalled();
  });

  it("does not mint a new-generation session using the password that was reset", async () => {
    state.beforeSessionRead = resetPassword;
    expect(await authService.signIn("owner@example.com", PASSWORD)).toBeNull();
    expect(state.user.password_hash).toBe(resetHash);
    expect(state.ensureAccount).not.toHaveBeenCalled();
  });

  it("leaves a token stale when a reset commits after the credential-bound read", async () => {
    state.afterSessionRead = resetPassword;
    const result = await authService.signIn("owner@example.com", PASSWORD);
    expect(result).not.toBeNull();
    expect(isCurrentToken(result!.token)).toBe(false);
  });

  it("upgrades a legacy hash and signs in with the generation returned after that change", async () => {
    state.user.password_hash = legacyHash;
    const result = await authService.signIn("owner@example.com", PASSWORD);
    expect(result).not.toBeNull();
    expect(String(state.user.password_hash)).toMatch(/^scrypt2\$/);
    expect(verifyPassword(PASSWORD, String(state.user.password_hash))).toBe(true);
    expect(isCurrentToken(result!.token)).toBe(true);
  });

  it("never overwrites a reset password with a delayed legacy rehash", async () => {
    state.user.password_hash = legacyHash;
    state.beforePasswordWrite = resetPassword;
    const result = await authService.signIn("owner@example.com", PASSWORD);
    expect(state.user.password_hash).toBe(resetHash);
    expect(result).toBeNull();
  });

  it("still permits legacy sign-in if only the best-effort rehash write fails", async () => {
    state.user.password_hash = legacyHash;
    state.failPasswordWrite = true;
    const result = await authService.signIn("owner@example.com", PASSWORD);
    expect(result).not.toBeNull();
    expect(state.user.password_hash).toBe(legacyHash);
    expect(isCurrentToken(result!.token)).toBe(true);
  });
});
