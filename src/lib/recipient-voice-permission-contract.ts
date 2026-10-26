/** Customer DTOs only: no server signing or database dependencies. */
export type VoicePermissionPurpose = "service_or_requested" | "marketing_or_sales" | "callback";

export type VoicePermissionSummary = {
  id: string;
  agent_id: string;
  bot_name: string;
  recipient_phone_masked: string;
  purpose: VoicePermissionPurpose;
  status: "pending" | "granted" | "revoked" | "expired" | "used";
  request_expires_at: string;
  expires_at: string;
  created_at: string;
  identity_assurance: "bearer_link_and_typed_signature";
};

export type VoicePermissionPublicView = {
  permission: VoicePermissionSummary;
  seller_name: string;
  disclosure: string;
  disclosure_hash: string;
  jurisdiction: { recipient_state: string; time_zone: string };
};
