import { log } from "./server-context";
import { getErrorMessage } from "./server-utils";

/**
 * Apollo.io Lead Intelligence Service
 * Enables autonomous lead prospecting based on Ideal Customer Profile (ICP).
 */

export interface ApolloContact {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  title: string;
  company: string;
  linkedin_url?: string;
  city?: string;
  state?: string;
}

export interface ApolloSearchParams {
  /** Job titles to target, e.g. ["CEO", "VP of Sales", "Owner"] */
  titles?: string[];
  /** Industries to target, e.g. ["Real Estate", "Insurance", "Finance"] */
  industries?: string[];
  /** Headcount ranges, e.g. ["1,10", "11,50"] */
  employee_ranges?: string[];
  /** US states to target, e.g. ["TX", "FL"] */
  states?: string[];
  /** Max results to pull per search */
  limit?: number;
}

const APOLLO_BASE = "https://api.apollo.io/v1";

/**
 * Search Apollo.io for new leads matching the provided ICP criteria.
 */
export async function searchLeads(params: ApolloSearchParams): Promise<ApolloContact[]> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) {
    log.warn("APOLLO_API_KEY not set — skipping lead search");
    return [];
  }

  try {
    const response = await fetch(`${APOLLO_BASE}/mixed_people/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        person_titles: params.titles || [],
        person_locations: params.states?.map(s => `${s}, United States`) || [],
        organization_num_employees_ranges: params.employee_ranges || ["1,50"],
        organization_industry_tag_ids: [], // Populated from Apollo taxonomy
        per_page: params.limit || 25,
        page: 1,
      }),
    });

    if (!response.ok) {
      throw new Error(`Apollo API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const people = (data.people || []) as any[];

    return people.map((p: any) => ({
      first_name: p.first_name || "",
      last_name: p.last_name || "",
      email: p.email || "",
      phone: p.phone_numbers?.[0]?.sanitized_number || p.sanitized_phone || "",
      title: p.title || "",
      company: p.organization?.name || "",
      linkedin_url: p.linkedin_url || undefined,
      city: p.city || undefined,
      state: p.state || undefined,
    })).filter((c: ApolloContact) => c.phone); // Only contacts with a phone number
  } catch (err) {
    log.error("Apollo lead search failed", { error: getErrorMessage(err) });
    return [];
  }
}

/**
 * Enrich a single lead with Apollo data (name, company, title from phone).
 */
export async function enrichLead(phone: string): Promise<Partial<ApolloContact> | null> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch(`${APOLLO_BASE}/people/match`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({ phone_number: phone, reveal_phone_number: false }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const p = data.person;
    if (!p) return null;

    return {
      first_name: p.first_name,
      last_name: p.last_name,
      title: p.title,
      company: p.organization?.name,
      linkedin_url: p.linkedin_url,
    };
  } catch (err) {
    log.error("Apollo enrichment failed", { error: getErrorMessage(err) });
    return null;
  }
}
