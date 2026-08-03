import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

const helpers = read("src/lib/webhook-helpers.ts");
const routes = read("src/routes/webhook-routes.ts");

describe("tenant webhook delivery signing", () => {
  it("signs deliveries with the vault-encrypted secret the webhook API stores", () => {
    expect(routes).toContain("values.secretEncrypted = encryptSecret(plaintextSecret)");
    expect(routes).toContain("values.secret = null");
    expect(helpers).toContain('import { decryptSecret } from "./secret-vault"');
    expect(helpers).toContain("secretEncrypted: string | null");
    expect(helpers).toContain("decryptSecret(hook.secretEncrypted)");
    expect(helpers).toContain('createHmac("sha256", signingSecret)');
    expect(helpers).toContain('headers["x-wireline-signature"] = `sha256=${digest}`');
  });

  it("fails closed instead of delivering unsigned when decryption breaks", () => {
    expect(helpers).toContain('lastError: "secret_decrypt_failed"');
    expect(helpers).not.toContain("Assuming plaintext or pre-decrypted");
  });

  it("publishes stable identifiers recipients can use for at-least-once deduplication", () => {
    expect(helpers).toContain('"x-wireline-delivery-id"');
    expect(helpers).toContain('"x-wireline-delivery-attempt"');
    expect(helpers).toContain('"x-wireline-event"');
    expect(helpers).toContain('headers["x-wireline-timestamp"]');
  });
});