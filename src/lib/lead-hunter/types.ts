export interface DiscoveredLead {
  id: string;
  businessName: string;
  phoneNumber: string; // E.164 format (+1XXXXXXXXXX)
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  rating?: number;
  reviewCount?: number;
  tradeCategory: string; // e.g. "hvac", "plumbing", "roofing", "electrical"
  notes?: string;
  sourceUrl?: string;
  discoveredAt: Date;
  status: "discovered" | "screened" | "contacted" | "qualified" | "closed" | "do_not_call";
}

export interface LeadDiscoveryParams {
  query: string;
  location?: string;
  tradeCategory?: string;
  limit?: number;
  minRating?: number;
}

export interface LeadDialRequest {
  leadId: string;
  userId: string;
  agentId: string;
  customerPhone: string;
  businessName: string;
  callPurpose: "appointment_service" | "existing_customer" | "sales" | "callback";
  openingContext?: string;
}

export interface LeadCallOutcome {
  leadId: string;
  callSid: string;
  outcome: "booked_appointment" | "sent_deposit_link" | "sent_email_quote" | "callback_requested" | "not_interested";
  appointmentTime?: Date;
  serviceAddress?: string;
  depositAmountCents?: number;
  notes?: string;
  recordedAt: Date;
}
