/* eslint-disable @typescript-eslint/no-explicit-any -- third-party API responses are vendor-defined JSON envelopes that don't ship with types. */
import { log } from "./server-context";
import { getErrorMessage } from "./server-utils";

/**
 * DocuSign E-Signature Service
 * Enables the Action Engine to send contracts and track signing status.
 */

const DOCUSIGN_BASE_URI = process.env.DOCUSIGN_BASE_URI || "https://demo.docusign.net/restapi";
const DOCUSIGN_ACCOUNT_ID = process.env.DOCUSIGN_ACCOUNT_ID;

export interface DocuSignEnvelope {
  envelopeId: string;
  status: string;
  sentAt: string;
  signingUrl?: string;
}

export interface SendContractParams {
  /** Recipient full name */
  recipientName: string;
  /** Recipient email address */
  recipientEmail: string;
  /** Your internal template ID in DocuSign */
  templateId?: string;
  /** Subject line for the signing email */
  subject?: string;
  /** Body message to accompany the document */
  message?: string;
  /** Custom fields to pre-fill (e.g., {client_name: "Acme Corp"}) */
  prefillFields?: Record<string, string>;
}

async function getAccessToken(): Promise<string | null> {
  const jwt = process.env.DOCUSIGN_JWT_TOKEN;
  if (jwt) return jwt; // In production, use JWT grant flow
  return process.env.DOCUSIGN_ACCESS_TOKEN || null;
}

/**
 * Send a contract for e-signature via DocuSign.
 */
export async function sendContract(params: SendContractParams): Promise<DocuSignEnvelope | null> {
  if (!DOCUSIGN_ACCOUNT_ID) {
    log.warn("DOCUSIGN_ACCOUNT_ID not set — skipping e-signature send");
    return null;
  }

  const accessToken = await getAccessToken();
  if (!accessToken) {
    log.warn("DocuSign access token not configured");
    return null;
  }

  try {
    const envelopeBody: any = {
      status: "sent",
      emailSubject: params.subject || "Please sign your agreement",
      emailBlurb: params.message || "Please review and sign the attached agreement.",
      recipients: {
        signers: [
          {
            name: params.recipientName,
            email: params.recipientEmail,
            recipientId: "1",
            routingOrder: "1",
            // If using a template, tabs will come from the template
          },
        ],
      },
    };

    // If using a pre-built template
    if (params.templateId) {
      envelopeBody.templateId = params.templateId;
      envelopeBody.templateRoles = [
        {
          roleName: "Client",
          name: params.recipientName,
          email: params.recipientEmail,
          tabs: params.prefillFields
            ? {
                textTabs: Object.entries(params.prefillFields).map(([tabLabel, value]) => ({
                  tabLabel,
                  value,
                })),
              }
            : undefined,
        },
      ];
      delete envelopeBody.recipients;
    }

    const response = await fetch(
      `${DOCUSIGN_BASE_URI}/v2.1/accounts/${DOCUSIGN_ACCOUNT_ID}/envelopes`,
      {
        method: "POST",
        signal: AbortSignal.timeout(15_000),
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(envelopeBody),
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`DocuSign API error ${response.status}: ${errText}`);
    }

    const data = await response.json();

    log.info("DocuSign envelope sent", {
      envelopeId: data.envelopeId,
      recipient: params.recipientEmail,
    });

    return {
      envelopeId: data.envelopeId,
      status: data.status,
      sentAt: new Date().toISOString(),
    };
  } catch (err) {
    log.error("DocuSign send failed", { error: getErrorMessage(err) });
    return null;
  }
}

/**
 * Get the current status of a sent envelope.
 */
export async function getEnvelopeStatus(envelopeId: string): Promise<string | null> {
  if (!DOCUSIGN_ACCOUNT_ID) return null;
  const accessToken = await getAccessToken();
  if (!accessToken) return null;

  try {
    const response = await fetch(
      `${DOCUSIGN_BASE_URI}/v2.1/accounts/${DOCUSIGN_ACCOUNT_ID}/envelopes/${envelopeId}`,
      {
        signal: AbortSignal.timeout(15_000),
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (!response.ok) return null;
    const data = await response.json();
    return data.status; // "sent" | "delivered" | "completed" | "declined" | "voided"
  } catch {
    return null;
  }
}
