import { createHash } from "node:crypto";
import type { DiscoveredLead, LeadDiscoveryParams } from "./types";

/**
 * Normalizes phone numbers to standard E.164 (+1XXXXXXXXXX for US/NANP)
 */
export function normalizeE164Phone(rawPhone: string): string | null {
  const digits = rawPhone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }
  if (rawPhone.startsWith("+") && digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }
  return null;
}

/**
 * Generates a deterministic lead ID from normalized business name and phone
 */
export function generateLeadId(businessName: string, phone: string): string {
  const norm = `${businessName.trim().toLowerCase()}:${phone.trim()}`;
  return `lead_${createHash("sha256").update(norm).digest("hex").slice(0, 16)}`;
}

export interface RawLeadListing {
  title: string;
  phone?: string;
  website?: string;
  address?: string;
  rating?: number;
  reviews?: number;
  category?: string;
}

/**
 * Ingests, normalizes, and validates raw browser extracted listings into qualified leads
 */
export function processRawListings(
  listings: RawLeadListing[],
  category = "trade_service",
  minRating = 0
): DiscoveredLead[] {
  const seenPhones = new Set<string>();
  const qualified: DiscoveredLead[] = [];

  for (const item of listings) {
    if (!item.title || !item.phone) continue;
    const normalizedPhone = normalizeE164Phone(item.phone);
    if (!normalizedPhone || seenPhones.has(normalizedPhone)) continue;

    if (item.rating !== undefined && item.rating < minRating) continue;

    seenPhones.add(normalizedPhone);

    const lead: DiscoveredLead = {
      id: generateLeadId(item.title, normalizedPhone),
      businessName: item.title.trim(),
      phoneNumber: normalizedPhone,
      website: item.website?.trim() || undefined,
      address: item.address?.trim() || undefined,
      rating: item.rating,
      reviewCount: item.reviews,
      tradeCategory: item.category?.trim().toLowerCase() || category,
      discoveredAt: new Date(),
      status: "discovered",
    };

    qualified.push(lead);
  }

  return qualified;
}

/**
 * In-memory registry of discovered leads (accessible during lead hunter sessions)
 */
export class LeadStore {
  private leads = new Map<string, DiscoveredLead>();

  addLeads(leads: DiscoveredLead[]): DiscoveredLead[] {
    const added: DiscoveredLead[] = [];
    for (const lead of leads) {
      if (!this.leads.has(lead.id)) {
        this.leads.set(lead.id, lead);
        added.push(lead);
      }
    }
    return added;
  }

  getLead(id: string): DiscoveredLead | undefined {
    return this.leads.get(id);
  }

  updateLeadStatus(id: string, status: DiscoveredLead["status"]): boolean {
    const lead = this.leads.get(id);
    if (!lead) return false;
    lead.status = status;
    return true;
  }

  listLeads(filter?: { category?: string; status?: DiscoveredLead["status"] }): DiscoveredLead[] {
    return Array.from(this.leads.values()).filter((lead) => {
      if (filter?.category && lead.tradeCategory !== filter.category) return false;
      if (filter?.status && lead.status !== filter.status) return false;
      return true;
    });
  }

  clear(): void {
    this.leads.clear();
  }
}

export const globalLeadStore = new LeadStore();
