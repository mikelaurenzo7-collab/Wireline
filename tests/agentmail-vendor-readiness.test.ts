import { describe, expect, it } from "vitest";

import {
  REQUIRED_AGENTMAIL_PERMISSIONS,
  agentMailDomainIdFromList,
  evaluateAgentMailReadiness,
} from "../scripts/lib/agentmail-readiness.mjs";

const ok = (body: unknown) => ({ ok: true, status: 200, body });

function fixture(overrides: Record<string, unknown> = {}) {
  const apiKey = "am_botbound_launch_secret";
  return {
    apiKey,
    configuredDomain: "bots.botbound.app",
    inboxesResponse: ok({ count: 0, inboxes: [] }),
    apiKeysResponse: ok({
      count: 1,
      api_keys: [
        {
          api_key_id: "key_1",
          prefix: "am_botbound_",
          permissions: Object.fromEntries(
            REQUIRED_AGENTMAIL_PERMISSIONS.map((permission) => [permission, true]),
          ),
        },
      ],
    }),
    domainsResponse: ok({
      count: 1,
      domains: [{ domain_id: "domain_1", domain: "bots.botbound.app" }],
    }),
    domainDetailResponse: ok({
      domain_id: "domain_1",
      domain: "bots.botbound.app",
      status: "VERIFIED",
    }),
    ...overrides,
  };
}

describe("AgentMail vendor readiness fixtures", () => {
  it("accepts an organization key with runtime permissions and a verified domain", () => {
    expect(evaluateAgentMailReadiness(fixture())).toMatchObject({
      ready: true,
      credentialsAccepted: true,
      activeKeyIdentified: true,
      organizationScoped: true,
      missingPermissions: [],
      domainListed: true,
      domainVerified: true,
    });
  });

  it("honors AgentMail's documented omitted-permissions full-access contract", () => {
    const input = fixture();
    input.apiKeysResponse = ok({
      api_keys: [{ api_key_id: "legacy_key", prefix: "am_botbound_" }],
    });
    expect(evaluateAgentMailReadiness(input)).toMatchObject({
      ready: true,
      missingPermissions: [],
    });
  });

  it("fails closed on malformed or rejected inventory responses", () => {
    expect(
      evaluateAgentMailReadiness(fixture({ inboxesResponse: ok({ inboxes: "unexpected-shape" }) })),
    ).toMatchObject({ ready: false, credentialsAccepted: false });
    expect(
      evaluateAgentMailReadiness(
        fixture({ apiKeysResponse: { ok: false, status: 403, body: {} } }),
      ),
    ).toMatchObject({ ready: false, keyInventoryReadable: false, activeKeyIdentified: false });
    expect(
      evaluateAgentMailReadiness(
        fixture({ domainDetailResponse: ok({ domain: "bots.botbound.app" }) }),
      ),
    ).toMatchObject({ ready: false, domainVerified: false });
  });

  it("fails closed when the active key is scoped or lacks a runtime permission", () => {
    const permissions = Object.fromEntries(
      REQUIRED_AGENTMAIL_PERMISSIONS.map((permission) => [permission, true]),
    );
    permissions.message_send = false;
    const restricted = fixture();
    restricted.apiKeysResponse = ok({
      api_keys: [
        {
          prefix: "am_botbound_",
          inbox_id: "one_inbox_only",
          permissions,
        },
      ],
    });

    expect(evaluateAgentMailReadiness(restricted)).toMatchObject({
      ready: false,
      organizationScoped: false,
      missingPermissions: ["message_send"],
    });
  });

  it("requires an exact listed domain and a matching VERIFIED detail response", () => {
    const list = ok({
      domains: [
        { domain_id: "domain_1", domain: "bots.botbound.app" },
        { domain_id: "domain_2", domain: "other.example" },
      ],
    });
    expect(agentMailDomainIdFromList(list, "@BOTS.BOTBOUND.APP")).toBe("domain_1");
    expect(agentMailDomainIdFromList(list, "botbound.app.attacker.example")).toBeNull();

    expect(
      evaluateAgentMailReadiness(
        fixture({
          domainDetailResponse: ok({
            domain_id: "domain_1",
            domain: "bots.botbound.app",
            status: "PENDING",
          }),
        }),
      ),
    ).toMatchObject({ ready: false, domainListed: true, domainVerified: false });
  });
});
