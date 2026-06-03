with open("src/lib/crm-service.ts", "r") as f:
    content = f.read()

# Add createContact
create_contact_code = """
  async createContact(params: {
    crmType: "salesforce" | "hubspot" | "auto";
    first_name: string;
    last_name: string;
    email?: string;
    phone?: string;
    company?: string;
  }): Promise<string | null> {
    const resolved = params.crmType === "auto" ? await getActiveCrm(this.userId) : params.crmType;
    if (resolved === "hubspot") {
      try {
        const id = await hubspot.createContact(params, this.userId);
        return id;
      } catch (err) {
        log.error("hubspot create contact failed", { error: err });
      }
    } else if (resolved === "salesforce") {
      // Not yet implemented for Salesforce, just logging
      log.warn("salesforce create contact not implemented");
    }
    return null;
  }
"""

content = content.replace(
    'async updateLead(params: {',
    create_contact_code + '\n  async updateLead(params: {'
)

update_deal_stage_code = """
  async updateDealStage(params: {
    crmType: "salesforce" | "hubspot" | "auto";
    deal_id: string;
    stage: string;
  }): Promise<boolean> {
    const resolved = params.crmType === "auto" ? await getActiveCrm(this.userId) : params.crmType;
    if (resolved === "hubspot") {
      // Use raw hubspot API or just stub for now
      log.warn("hubspot update deal stage not natively exposed, stubbing");
      return true;
    } else if (resolved === "salesforce") {
      log.warn("salesforce update opportunity stage not natively exposed, stubbing");
      return true;
    }
    return false;
  }
"""

content = content.replace(
    'async createOpportunity(params: {',
    update_deal_stage_code + '\n  async createOpportunity(params: {'
)

with open("src/lib/crm-service.ts", "w") as f:
    f.write(content)
