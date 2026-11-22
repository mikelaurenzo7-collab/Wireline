import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [relative(root, path)] : [];
  });
}

const WRITES_ENVELOPE = /\.(insert|update)\((schema\.)?userPreferences\)/;
const TAKES_SHARED_LOCK =
  /lockPreferenceEnvelope\(|updatePreferenceEnvelope\(|acquireCompanyIdentityMutationLock\(|pg_advisory_xact_lock\(hashtext\('company-identity'\)/;

// The legacy POST /api/user-preferences handler in settings-routes.ts never
// runs: the guarded writer is registered first and ends the request.
const SHADOWED = new Set(["src/routes/settings-routes.ts"]);

describe("preference envelope writers", () => {
  it("every writer of the shared preferences envelope takes the shared lock", () => {
    const writers = sourceFiles(resolve(root, "src")).filter((file) =>
      WRITES_ENVELOPE.test(read(file)),
    );
    expect(writers.length).toBeGreaterThan(5);
    const unlocked = writers.filter(
      (file) => !SHADOWED.has(file) && !TAKES_SHARED_LOCK.test(read(file)),
    );
    expect(unlocked).toEqual([]);
  });

  it("the shadowed legacy writer really is shadowed by the guarded one", () => {
    const registry = read("src/server/register-api-routes.ts");
    expect(registry.indexOf("app.use(userPreferenceGuardRouter)")).toBeGreaterThan(0);
    expect(registry.indexOf("app.use(userPreferenceGuardRouter)")).toBeLessThan(
      registry.indexOf("app.use(settingsRouter)"),
    );
  });

  it("the helper locks before it reads, inside one transaction", () => {
    const helper = read("src/lib/preference-envelope.ts");
    const lock = helper.indexOf("await lockPreferenceEnvelope(tx, userId);");
    const select = helper.indexOf(".select({ preferences: schema.userPreferences.preferences })");
    expect(helper).toContain("return drizzle.transaction(async (tx) => {");
    expect(lock).toBeGreaterThan(0);
    expect(select).toBeGreaterThan(lock);
    expect(helper).toContain(
      "pg_advisory_xact_lock(hashtext('company-identity'), hashtext(${userId}))",
    );
  });
});
