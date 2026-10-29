import { createHash } from "node:crypto";

export interface SendAppointmentEmailParams {
  userId: string;
  agentId: string;
  customerEmail: string;
  customerName: string;
  appointmentTime: Date;
  serviceTitle: string;
  icsContent: string;
}

export interface SendPaymentReceiptEmailParams {
  userId: string;
  agentId: string;
  customerEmail: string;
  amountUsd: string;
  receiptNumber: string;
  description: string;
}

export function buildBrandedInboxParams(agentId: string, domain = "bots.botbound.app"): {
  username: string;
  domain: string;
  displayName: string;
  clientId: string;
  metadata: Record<string, string>;
} {
  const cleanId = agentId.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 16);
  const username = `bot-${cleanId}`;
  const clientId = `botbound-agent-${createHash("sha256").update(JSON.stringify([agentId, domain.toLowerCase()])).digest("hex").slice(0, 32)}`;

  return {
    username,
    domain,
    displayName: "BotBound Dispatch Assistant",
    clientId,
    metadata: {
      platform: "BotBound",
      agent_id: agentId,
      managed: "true",
      tenant_domain: domain,
    },
  };
}
