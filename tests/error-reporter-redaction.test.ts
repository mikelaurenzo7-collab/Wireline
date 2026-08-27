import { describe, expect, it } from "vitest";

import { buildSentryStorePayload } from "../src/lib/error-reporter";

describe("Sentry payload redaction", () => {
  it("redacts secrets and personal data across errors, tags, nested objects, and arrays", () => {
    const secrets = {
      email: "qa.telemetry@example.com",
      bearer: "fake_bearer_token_123456",
      token: "fake_token_value_234567",
      password: "fake_password_value_345678",
      credential: "fake_credential_value_456789",
      phone: "+1 (415) 555-0198",
      compactPhone: "415-555-0199",
      prefixedKey: "sk_live_FakeTelemetryKey123456",
    };
    const error = new Error(
      [
        `lead import failed for ${secrets.email}`,
        `Authorization: Bearer ${secrets.bearer}`,
        `password=${secrets.password}`,
        `caller ${secrets.phone}`,
        `\nparams: ${secrets.email},${secrets.token}`,
      ].join("\n"),
    );
    error.name = "LeadImportTimeoutError";
    error.stack = [
      `${error.name}: token=${secrets.token}`,
      `    at processLead (/srv/worker.ts:42:17) for ${secrets.compactPhone}`,
    ].join("\n");

    const payload = buildSentryStorePayload(error, {
      tags: {
        surface: "meta-lead-import",
        contact: secrets.email,
        authToken: secrets.token,
      },
      operation: "ingest lead",
      statusCode: 503,
      retryable: true,
      request: {
        credential: secrets.credential,
        apiKey: secrets.prefixedKey,
        nested: [
          { password: secrets.password, note: `caller=${secrets.phone}` },
          [
            `Bearer ${secrets.bearer}`,
            `email=${secrets.email}`,
            `provider key ${secrets.prefixedKey}`,
          ],
        ],
        params: [secrets.email, secrets.token],
      },
    });

    const serialized = JSON.stringify(payload);
    for (const secret of Object.values(secrets)) {
      expect(serialized).not.toContain(secret);
    }
    expect(serialized).toContain("[REDACTED]");
    expect(serialized).toContain("[redacted-email]");
    expect(serialized).toContain("[redacted-phone]");
    expect(serialized).toContain("[redacted-params]");

    expect(payload).toMatchObject({
      level: "error",
      logger: "wireline-server",
      exception: {
        values: [{ type: "LeadImportTimeoutError" }],
      },
      tags: {
        surface: "meta-lead-import",
        authToken: "[REDACTED]",
      },
      extra: {
        operation: "ingest lead",
        statusCode: 503,
        retryable: true,
      },
    });
  });

  it("keeps safe diagnostics JSON-serializable while bounding hostile context", () => {
    const details: Record<string, unknown> = {
      durationMs: 842,
      attempts: [1, 2, 3],
      providerStatus: "temporarily_unavailable",
      costMicros: 12_345n,
    };
    details.self = details;

    const error = new Error("upstream timed out after 842ms");
    error.name = "ProviderTimeoutError";
    error.stack = [
      "ProviderTimeoutError: upstream timed out after 842ms",
      "    at dispatchLead (/srv/jobs/lead-worker.ts:88:21)",
    ].join("\n");

    const payload = buildSentryStorePayload(error, {
      tags: { surface: "lead-worker", attempt: 3 },
      operation: "dispatch lead",
      statusCode: 504,
      details,
    });

    expect(() => JSON.stringify(payload)).not.toThrow();
    expect(payload).toMatchObject({
      exception: {
        values: [
          {
            type: "ProviderTimeoutError",
            value: "upstream timed out after 842ms",
          },
        ],
      },
      tags: { surface: "lead-worker", attempt: "3" },
      extra: {
        operation: "dispatch lead",
        statusCode: 504,
        details: {
          durationMs: 842,
          attempts: [1, 2, 3],
          providerStatus: "temporarily_unavailable",
          costMicros: "12345",
          self: "[Circular]",
        },
      },
    });
    expect(JSON.stringify(payload)).toContain("/srv/jobs/lead-worker.ts:88:21");
  });

  it("bounds very large strings after redaction and marks the retained prefix", () => {
    const omittedTail = "should-not-survive@example.com";
    const payload = buildSentryStorePayload(new Error("oversized provider response"), {
      operation: "parse provider response",
      response: {
        body: `useful response prefix: ${"x".repeat(100_000)}${omittedTail}`,
      },
    });

    const body = (payload.extra as { response: { body: string } }).response.body;
    expect(body).toMatch(/^useful response prefix: x+/);
    expect(body).toHaveLength(2_000);
    expect(body).toMatch(/…\[truncated\]$/);
    expect(body).not.toContain(omittedTail);
    expect(() => JSON.stringify(payload)).not.toThrow();
  });
});
