export const REQUIRED_AGENTMAIL_PERMISSIONS = Object.freeze([
  "inbox_read",
  "inbox_create",
  "inbox_delete",
  "message_read",
  "message_send",
  "webhook_read",
  "webhook_create",
  "webhook_delete",
  "domain_read",
]);

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function responseArray(response, key) {
  const body = response?.ok === true ? asRecord(response.body) : null;
  return body && Array.isArray(body[key]) ? body[key] : null;
}

function normalizedText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeAgentMailDomain(value) {
  const domain = normalizedText(value).toLowerCase().replace(/^@/, "");
  if (!domain || !domain.includes(".")) return null;
  return /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/.test(domain) ? domain : null;
}

function matchingAgentMailDomain(domainsResponse, configuredDomain) {
  const domain = normalizeAgentMailDomain(configuredDomain);
  const domains = responseArray(domainsResponse, "domains");
  if (!domain || !domains) return null;
  return (
    domains
      .map(asRecord)
      .filter(Boolean)
      .find((entry) => normalizedText(entry.domain).toLowerCase() === domain) ?? null
  );
}

export function agentMailDomainIdFromList(domainsResponse, configuredDomain) {
  return (
    normalizedText(matchingAgentMailDomain(domainsResponse, configuredDomain)?.domain_id) || null
  );
}

export function evaluateAgentMailReadiness({
  apiKey,
  configuredDomain,
  inboxesResponse,
  apiKeysResponse,
  domainsResponse,
  domainDetailResponse,
}) {
  const normalizedDomain = normalizeAgentMailDomain(configuredDomain);
  const inboxes = responseArray(inboxesResponse, "inboxes");
  const apiKeys = responseArray(apiKeysResponse, "api_keys");
  const domains = responseArray(domainsResponse, "domains");
  const domainSummary = matchingAgentMailDomain(domainsResponse, normalizedDomain);
  const domainId = normalizedText(domainSummary?.domain_id);

  const suppliedKey = normalizedText(apiKey);
  const matchingKey =
    apiKeys
      ?.map(asRecord)
      .filter(Boolean)
      .find((entry) => {
        const prefix = normalizedText(entry.prefix);
        return prefix.length > 0 && suppliedKey.startsWith(prefix);
      }) ?? null;
  const permissionsPresent = Boolean(
    matchingKey && Object.prototype.hasOwnProperty.call(matchingKey, "permissions"),
  );
  const permissions = permissionsPresent ? asRecord(matchingKey?.permissions) : null;
  // AgentMail documents omitted permissions as an unrestricted legacy/full-
  // access key. A present but malformed permissions value remains fail-closed.
  const missingPermissions = matchingKey
    ? permissionsPresent
      ? REQUIRED_AGENTMAIL_PERMISSIONS.filter((permission) => permissions?.[permission] !== true)
      : []
    : [...REQUIRED_AGENTMAIL_PERMISSIONS];
  const organizationScoped = Boolean(
    matchingKey && !normalizedText(matchingKey.pod_id) && !normalizedText(matchingKey.inbox_id),
  );

  const detail = domainDetailResponse?.ok === true ? asRecord(domainDetailResponse.body) : null;
  const domainDetailMatches = Boolean(
    detail &&
    domainId &&
    normalizedText(detail.domain_id) === domainId &&
    normalizedText(detail.domain).toLowerCase() === normalizedDomain,
  );
  const domainVerified = Boolean(
    domainDetailMatches && normalizedText(detail.status).toUpperCase() === "VERIFIED",
  );
  const credentialsAccepted = Boolean(suppliedKey && inboxes);
  const keyInventoryReadable = Boolean(apiKeys);
  const domainInventoryReadable = Boolean(domains);
  const activeKeyIdentified = Boolean(matchingKey);
  const domainListed = Boolean(domainSummary && domainId);

  return {
    ready: Boolean(
      normalizedDomain &&
      credentialsAccepted &&
      keyInventoryReadable &&
      activeKeyIdentified &&
      organizationScoped &&
      missingPermissions.length === 0 &&
      domainInventoryReadable &&
      domainListed &&
      domainVerified,
    ),
    configuredDomain: normalizedDomain,
    credentialsAccepted,
    inboxInventoryReadable: Boolean(inboxes),
    keyInventoryReadable,
    activeKeyIdentified,
    organizationScoped,
    missingPermissions,
    domainInventoryReadable,
    domainListed,
    domainVerified,
  };
}
