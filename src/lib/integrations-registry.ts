import {
  RUNTIME_INTEGRATIONS,
  getRuntimeCapabilities,
  getRuntimeIntegrationStatus,
  type IntegrationDescriptor,
  type IntegrationGroup,
  type IntegrationStatus,
} from "./runtime-integrations-registry";

export type { IntegrationDescriptor, IntegrationGroup, IntegrationStatus };
export const INTEGRATIONS = RUNTIME_INTEGRATIONS;
export const GROUP_LABELS: Record<IntegrationGroup, string> = {
  core: "Core",
  ai: "AI runtime",
  voice: "Voice",
  oauth: "Workspace",
  billing: "Billing",
  actions: "Actions",
  infra: "Infrastructure",
  security: "Security",
};
export type IntegrationStatusResult = ReturnType<typeof getRuntimeIntegrationStatus>[number];
export const getIntegrationsStatus = getRuntimeIntegrationStatus;
export const getHealthCapabilities = getRuntimeCapabilities;
