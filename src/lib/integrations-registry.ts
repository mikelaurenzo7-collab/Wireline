import {
  getRuntimeCapabilities,
  getRuntimeIntegrationStatus,
  type IntegrationDescriptor,
  type IntegrationGroup,
} from "./runtime-integrations-registry";

export type { IntegrationDescriptor, IntegrationGroup };
export type IntegrationStatusResult = ReturnType<typeof getRuntimeIntegrationStatus>[number];
export const getIntegrationsStatus = getRuntimeIntegrationStatus;
export const getHealthCapabilities = getRuntimeCapabilities;
