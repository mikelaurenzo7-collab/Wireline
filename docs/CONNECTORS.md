# BotBound connections and permissioned automation

> **October 27, 2026 direction:** The launch offer starts with incoming calls, requested email, and supervised Computer work. The founder chose to show SMS on the homepage phone card. Keep campaign calling outside launch promotion; capability descriptions and older proposed directions below do not establish provider approval or authorize activation. Product identity should stay compact and useful during live work; the use of pets remains undecided.


Status: research and source-code audit as of 27 October 2026, against main at 36d4baac12426b8af265593887b12e6bd4bede5a. This is a product direction, not proof that every vendor account, scope, or write action works. No customer demand is inferred from founder and demo accounts.

## Product decision

Keep the product simple for very small businesses. BotBound owns the conversation, phone and text channels, customer record, interaction history, follow-up queue, approvals, basic appointment flow, and permission policy. Connect business email and the Google Workspace or Microsoft 365 tools owners already use. Do not turn Connections into a catalogue of software companies.

Build provider adapters behind BotBound business actions. The owner connects an account and chooses Full access, Auto, or Ask for approval. BotBound decides whether an action is allowed; the provider adapter only performs the narrow, named operation. A future provider must not receive unrestricted agent instructions or an arbitrary MCP tool surface.

Marketing may present calls, SMS, outbound calling, email, and Computer as available capabilities, as directed by the owner. A workspace may still need to connect or configure its service before an action can run. Explain that setup in the relevant control; do not call a sold capability beta, unavailable, or “coming soon,” and do not imply carrier approval has already happened for a specific account.

## Current code inventory and feature replacement

Verified on current main: ConnectionsPage renders MailboxConnectionCard and a Connected Tools section containing CrmConnectionCard. The provider list and beta flags are in src/components/CrmConnectionCard.tsx; provider actions and customer-facing explanations are in src/lib/integration-playbooks.ts and src/lib/agent-capabilities.ts; OAuth routes remain in src/routes/oauth/index.ts. These are present in main even where a provider is not configured. This means previous local cleanup work is not yet on main.

| Current integration | What it does in code | Decision for the small-business product |
| --- | --- | --- |
| HubSpot and Salesforce | Search/create contacts; log calls; create opportunities and update deal stages. | Remove as separate offerings. Build BotBound People, interaction history, and a small follow-up queue. Do not clone full sales pipelines. Preserve old saved grants only for safe disconnect and migration compatibility. |
| Slack and Microsoft Teams | Send caller, lead, escalation, and compliance alerts to team channels. | Remove channel-specific setup. Put owner-facing work in BotBound Inbox, tasks, and approvals. Keep Microsoft email, calendar, and file connections; Teams is not required to keep Microsoft 365. |
| X and X Ads | Publish, reply, like, repost, send DMs, list campaigns, read performance. | Remove. Social publishing and ad operations are outside the receptionist and follow-up job. |
| Meta Lead Ads | Attribute and follow up with paid social leads through a conversion event. Marked beta in the UI. | Remove from customer surfaces; do not relabel it as ready. |
| Apollo | Enrich phone leads with title, company size, and profile data. | Remove. Capture what callers share and let BotBound retain an owner-approved customer record. Do not scrape or enrich prospects by default. |
| Shopify | Order/customer lookup, inventory, returns, cancellations, address changes, discounts, draft orders and order notes. | Remove as a general connector. It serves a commerce operator, not the broad micro-SMB audience. Reconsider only if ecommerce operators become a chosen segment. |
| Square | Order/customer lookup, catalog availability, payment links and invoices. | Remove as a general connector. Square appointments or POS may be a later vertical adapter if salon or restaurant demand is proven; do not restore the present broad commerce bundle by default. |
| Zoom | Create video meeting links during booking. Marked beta in the UI. | Remove as a separate offering. Google and Microsoft calendars can own meeting details for their accounts. |
| DocuSign | Dispatch and track signature envelopes. | Defer. It adds contract and recipient risk to a basic phone workflow. Use email and owner follow-up until demand justifies a narrow signing adapter. |
| Google Sheets and Microsoft Excel actions | Append call outcomes and notes to a spreadsheet. Both are marked beta in the UI. | Keep Google and Microsoft business tools as user environments, but remove separate “log every call to a sheet” actions from the default product. BotBound owns the interaction history; offer a data export, then add opt-in sync only if owners ask for it. |
| Yahoo and iCloud Mail | Yahoo connection records exist but refresh/send is incomplete; iCloud uses an Apple app password. | Do not offer Yahoo or iCloud as primary business mail integrations. Keep Gmail/Google Workspace and Outlook/Microsoft 365 as the supported business paths. Retain saved legacy grants only to let owners disconnect safely. |
| AgentMail | Managed mailbox used by the product's email-agent/runtime path. | Keep as internal infrastructure where needed; never present it as a customer connector or request a customer's AgentMail account. |
| WhatsApp | Messaging catalog copy and runtime metadata say private beta. | Remove the customer-facing option and block every new send path. SMS remains the product messaging capability. Keep historical records only for reconciliation and deletion safety. |
| Resend and Twilio | BotBound delivery and phone infrastructure, not customer software integrations. | Keep internal. Do not expose infrastructure credentials, model spend, or carrier operations as customer connectors. |

This mapping describes features, not only brand names. Retiring a tile does not authorize deleting tenant data, schema, permissions or OAuth grants. First prevent new connections and tool dispatch, preserve disconnect/revoke, history and audit behavior, then remove dead routes and code through tested, reviewable changes. Database cleanup stays manual.

## Future connector landscape

This is a broad scan of public vendor documentation for scheduling, trades, salons, restaurants, office tools, commerce, finance, support, communications and automation. The sources below are vendor docs or feature pages. They were not tested with merchant credentials. API write access, partner approval, fees and plan eligibility must be rechecked before any build. Several vendors already sell their own AI receptionist; avoid spending time integrating around a native feature until a specific customer need remains.

| Segment | Candidates and verified API posture | Product call |
| --- | --- | --- |
| General scheduling | Acuity documents availability plus create, update, reschedule and cancel. Setmore documents availability, staff, services, and appointment lifecycle; API access is Pro and requires a request. SimplyBook exposes an API key through support. Calendly documents scheduling for AI agents, but has no direct reschedule endpoint in the reviewed guide. | Start with BotBound's simple calendar flow and Google/Microsoft calendar adapters. Do not add several overlapping booking tiles. A scheduling adapter is a future P2 after demand is measured. |
| Microsoft scheduling | Microsoft Bookings has shared booking APIs through Graph, with plan and admin-consent requirements. | Include with Microsoft 365 only when the customer's tenant and consent allow it; no separate marketplace tile. |
| Home services and trades | Jobber has a GraphQL API, webhooks and a sandbox; the reviewed docs did not establish the needed booking/job mutations. Housecall Pro documents customer, job and schedule writes but API access is limited to MAX. ServiceTitan documents appointments and jobs but access requires approval/onboarding. Workiz has an API add-on; its appointment availability endpoint was marked beta. ServiceM8 documents jobs, schedules and availability with OAuth/partner onboarding. FieldEdge documents work-order APIs with partner access. Thryv's public developer portal did not confirm a current appointment-write path. | Do not pick a connector before choosing a launch vertical. Jobber or ServiceM8 are plausible research candidates for very small trades; validate the precise write path, price, onboarding and customer demand first. Never depend on the beta Workiz availability endpoint. |
| Salons and personal care | Square Bookings documents availability and appointment lifecycle, with seller writes requiring a paid plan. Vagaro has API docs but public booking-write/access requirements were unclear. Fresha's Data Connector is one-way in the reviewed docs. Mindbody documents client and appointment endpoints with live access/fee requirements. Boulevard documents appointment/client scopes for enterprise access. Jane's public API is primarily read-only in the reviewed docs. GlossGenius had no public merchant write API in the reviewed search. Booksy developer docs are gated; its AI receptionist page is explicitly beta. | Do not advertise any of these as supported. For a salon adapter, first compare a customer's existing booking system and the exact create/change/cancel scopes. Avoid competing with a vendor's native AI receptionist without a remaining BotBound advantage. |
| Restaurants and reservations | Toast's standard API is read-focused; order writes require partner certification. Clover requires production-app approval. Lightspeed custom apps exclude important order/reservation scopes without partner access. SpotOn requires partner certification. OpenTable has partner APIs and Voice AI; SevenRooms provisions partner API access and offers Voice AI; Yelp has partner reservation/waitlist APIs and Yelp Host voice AI. Tock's reviewed API supports guest/reservation sync but not create/cancel. No public Resy phone-booking API was found in the reviewed developer materials. DoorDash production access is restricted; Uber Eats API use requires OAuth and approval. Square's AI phone ordering is a competing native feature for restaurants. | Do not build a restaurant marketplace. If restaurant demand becomes the chosen segment, validate one reservation or ordering partner's write contract and native AI overlap first. Never describe a read-only sync as booking support. |
| CRM and sales | HubSpot, Salesforce and Pipedrive expose CRM APIs; GoHighLevel is common in some service businesses but adds a broader marketing platform. | Prefer native People and follow-up. Add only a narrow customer lookup or activity-write adapter if pilot owners already rely on one CRM. Never build pipeline stages before owners demonstrate the need. |
| Accounting and payments | QuickBooks Online, Xero, Wave, FreshBooks and Zoho Books have APIs with sensitive financial data and varying app-review or plan requirements. | Do not put finance, payout, refund or bookkeeping operations in call automation. BotBound billing remains its own internal product boundary. |
| Customer support | Zendesk, Intercom and Freshdesk expose support APIs; Zendesk's old chat API is maintenance-only. | BotBound already owns the small-team inbox and handoff. Defer support-suite adapters until a real support-team segment appears. |
| Office files and collaboration | Dropbox supports scoped OAuth, files, sharing and webhooks. Google Workspace and Microsoft Graph cover mail, calendar and file workflows; Sheets/Excel remain available as office documents, not default call-log targets. | Keep Gmail, Outlook, Google/Microsoft calendars and Drive/OneDrive file access. Keep the interface small and permission scopes narrow. Teams/Slack are not required for this core connection. |
| Communications | RingCentral Call Control requires special scopes/support, Dialpad has OAuth scopes, and Aircall has a marketplace OAuth flow. | Phone forwarding/porting is simpler for most tiny businesses. Defer telephony management integrations unless a chosen segment needs call-center controls. |
| Automation platforms | Zapier MCP has a large catalogue and usage-based tasks. Make MCP consumes credits and separates scenario runs from administration. n8n is technical/self-hosted; Pipedream is developer-focused. | Do not expose arbitrary MCP or an open automation marketplace. Later, a BotBound-owned event/action bridge may trigger a small allowlist of reviewed actions. |
| AI-native tools | AgentMail is a managed email/runtime provider rather than a standard SMB integration. Google and Microsoft MCP offerings reviewed were previews and can access broad read/write/delete scopes. | Keep AI infrastructure private. No broad MCP tool surface and no preview/experimental customer connectors. |

## Adapter contract for permissioned automation

P1 foundation; ship incrementally as each action is required:

1. Define stable BotBound actions such as find a customer, record an interaction, check availability, create or change an appointment, prepare a follow-up, send an approved message, and hand off to a person. The action name and result stay the same when a provider changes.
2. Give each provider adapter only the OAuth scopes and named operations that action needs. Read and write capability are separate; broad write scopes are not implied by connection.
3. Apply the owner's permission mode in the BotBound policy layer before calling an adapter:
   - Full access allows the supported, configured actions, subject to consent, safety, carrier, account and law requirements.
   - Auto handles only defined low-risk actions and pauses for approval when a rule says review is required.
   - Ask for approval holds the action for the owner.
4. Record who or what requested the action, the permission decision, provider, idempotency key, result and any approval. Make retries safe. Normalize provider failures so an outage never looks like success.
5. Make disconnect/revocation stop new work promptly. Keep audit and delivery receipts; do not expose API keys or raw model traces to customers.
6. Treat provider content and webhooks as untrusted input. Never let connected data expand the tool allowlist or override BotBound's permission policy. No arbitrary code execution or unrestricted MCP tools.

## Priorities and gates

| Priority | Work | Gate |
| --- | --- | --- |
| P0 | Remove beta and retired provider choices from customer setup; disable their action dispatch without deleting existing records. Remove customer-visible “private beta” copy. | Route, catalog, OAuth, webhook, agent-tool and legacy-grant tests prove there is no new connect or action path and owners can still disconnect. Identify every removed provider in the ship note. |
| P1 | Keep and simplify Gmail/Google Workspace, Outlook/Microsoft 365, business calendar and file connections; ensure BotBound-native People, activity and approvals replace redundant CRM/team features. | Read/write scopes and permission tiers tested per action; customer screens show one clear connection path; no Google/Microsoft credential or file content leaks into analytics. |
| P1 | Use one adapter interface and action policy for all providers. | Contract tests cover Full access, Auto, Ask, denied/revoked grants, retries, idempotency and provider failure. |
| P2 | Add one vertical adapter only after customer interviews or pilot behavior establish recurring demand. | Named target segment, an owner-approved use case, working non-beta write API, explicit provider and plan requirements, fees, support cost, revoke path, accessibility and support plan. |
| P2 | Consider an event/action bridge to an automation service. | Starts with a small allowlist, visible permission and audit log, verified retry semantics, and no arbitrary remote tool execution. |

## Beta and preview ledger

Remove these states from BotBound customer surfaces and report their final disposition at the end of the redesign. They are not launch claims:

- Zoom and Meta Lead Ads carry beta flags in src/components/CrmConnectionCard.tsx.
- Microsoft Teams, Excel and Google Sheets also carry beta flags in that provider list. Keep the core Microsoft/Google email, calendar and file paths; remove or validate each separate action before showing it.
- WhatsApp is described as private beta in src/lib/runtime-integrations-registry.ts and src/lib/integration-playbooks.ts.
- The Android app is labeled Internal beta and iOS Planned in src/lib/product-copy.ts. These are mobile-product items and need their own release-state audit.
- Workiz availability endpoint and Booksy AI receptionist are beta in their vendor docs; do not select them as a foundation.
- Google and Microsoft MCP offerings are previews; do not expose them as customer connectors.
- AgentMail remains internal; do not turn its AI focus into a customer badge or sales promise.

## Official sources

### Trades and scheduling

- [Jobber API docs](https://developer.getjobber.com/docs/) and [queries/mutations](https://developer.getjobber.com/docs/using_jobbers_api/api_queries_and_mutations/)
- [Housecall Pro API access](https://help.housecallpro.com/en/articles/8505035-api-overview) and [CSR AI](https://help.housecallpro.com/en/articles/9740104-csr-ai-overview)
- [ServiceTitan developer access](https://developer.servicetitan.io/docs/get-going-getting-access/) and [Pro Virtual Agent](https://www.servicetitan.com/features/pro/virtual-agent)
- [Workiz API v2](https://developer.workiz.com/v2/) and [Genius Answering](https://www.workiz.com/features/genius-answering/)
- [FieldEdge API](https://docs-dev.fieldedge.com/)
- [ServiceM8 REST API](https://developer.servicem8.com/docs/rest-overview) and [authentication](https://developer.servicem8.com/docs/authentication)
- [Thryv developer portal](https://developer.labs.thryv.com/)
- [Acuity API](https://developers.acuityscheduling.com/) and [pricing](https://acuityscheduling.com/pricing/)
- [Setmore API access](https://support.setmore.com/en/articles/579360-request-access-to-the-setmore-api)
- [SimplyBook API](https://simplybook.me/en/api/developer-api)
- [Calendly AI scheduling API](https://developer.calendly.com/docs/api-guides/schedule-events-with-ai-agents) and [FAQ](https://developer.calendly.com/docs/getting-started/frequently-asked-questions)
- [Microsoft Bookings API](https://learn.microsoft.com/en-us/graph/api/resources/booking-api-overview?view=graph-rest-1.0)

### Salon, commerce and restaurants

- [Square Bookings API](https://developer.squareup.com/docs/bookings-api/use-the-api) and [Orders API](https://developer.squareup.com/docs/orders-api/what-it-does)
- [Vagaro API](https://docs.vagaro.com/public/reference/api-introduction) and [Vera receptionist](https://support.vagaro.com/hc/en-us/articles/31806231306779-Set-Up-A-Chatbot-for-Your-Business-with-Vera-Receptionist)
- [Fresha Data Connector](https://www.fresha.com/help-center/knowledge-base/reports/432-data-connector-overview) and [AI Concierge](https://www.fresha.com/for-business/features/ai-concierge)
- [Mindbody endpoints](https://developers.mindbodyonline.com/Resources/Endpoints) and [AI Concierge](https://www.mindbodyonline.com/business/ai-concierge)
- [Boulevard API scopes](https://developers.joinblvd.com/2026-06/admin-api/api-scopes) and [AI Receptionist](https://www.joinblvd.com/features/ai-receptionist)
- [GlossGenius Reception](https://glossgenius.com/reception)
- [Booksy developer docs](https://docs.booksy.com/) and [AI Receptionist beta](https://biz.booksy.com/features/ai-receptionist-beta)
- [Jane developer platform](https://developers.jane.app/docs/getting-started)
- [Toast API access](https://doc.toasttab.com/doc/devguide/devApiAccessRequirements.html) and [SoundHound phone ordering](https://support.toasttab.com/en/article/Get-Started-With-the-SoundHound-Integration)
- [Clover app launch checklist](https://docs.clover.com/dev/docs/from-sandbox-to-app-launch-checklist)
- [Lightspeed custom integrations](https://api-portal.lsk.lightspeed.app/quick-start/custom-integrations)
- [SpotOn certification](https://developers.spoton.com/central-api/docs/certification-process) and [API getting started](https://developers.spoton.com/central-api/docs/getting-started)
- [OpenTable API partners](https://www.opentable.com/restaurant-solutions/api-partners/) and [Voice AI](https://www.opentable.com/restaurant-solutions/products/reservation-management/voice-ai/)
- [SevenRooms API](https://api-docs.sevenrooms.com/) and [VoiceAI](https://sevenrooms.com/platform/VoiceAI/)
- [Yelp partner APIs](https://docs.developer.yelp.com/docs/yelp-partner-apis) and [Yelp Host](https://business.yelp.com/restaurants/products/yelp-host/)
- [Tock API FAQ](https://tock.zendesk.com/hc/en-us/articles/25447494175508-API-FAQ)
- [Resy developer page](https://resy.com/developers)
- [DoorDash production access](https://developer.doordash.com/en-US/docs/marketplace/how_to/production_access/)
- [Uber Eats API](https://developer.uber.com/docs/eats/introduction)

### CRM, email, finance and automation

- [HubSpot CRM API](https://developers.hubspot.com/docs/api/overview)
- [Salesforce REST API](https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/)
- [Pipedrive API](https://developers.pipedrive.com/docs/api/v1)
- [QuickBooks Online API](https://developer.intuit.com/app/developer/qbo/docs/develop)
- [Xero API](https://developer.xero.com/documentation/api/accounting/overview)
- [Wave API](https://developer.waveapps.com/hc/en-us/articles/360019968212-Getting-Started)
- [FreshBooks API](https://www.freshbooks.com/api)
- [Zoho Books API](https://www.zoho.com/books/api/v3/)
- [Dropbox developer docs](https://dropbox.tech/developers) and [webhooks](https://docs.dropboxapi.com/dropbox-api/docs/webhooks.md)
- [Zapier MCP](https://docs.zapier.com/mcp/home)
- [Make MCP](https://developers.make.com/mcp-server)
- [n8n documentation](https://docs.n8n.io/)
- [Pipedream documentation](https://pipedream.com/docs/)
- [Google Calendar API](https://developers.google.com/calendar/api/v3/reference)
- [Microsoft Graph Bookings API](https://learn.microsoft.com/en-us/graph/api/resources/booking-api-overview?view=graph-rest-1.0)
- [RingCentral Call Control](https://developers.ringcentral.com/guide/voice/call-control)
- [Dialpad API](https://developers.dialpad.com/reference)
- [Aircall API](https://developer.aircall.io/)
