# Wireline route contract

This contract keeps web, browser extension, native apps, docs, and launch QA aligned around the same product map.

## Canonical workspace routes

| Job | Route | Surface label | Notes |
| --- | --- | --- | --- |
| Home and daily state | `/overview` | Overview | Default authenticated landing surface. |
| Build and operate an agent | `/studio` | Studio | Main Create and Run workspace. |
| Train the agent | `/knowledge` | Knowledge | Documents, policy, voice, and behavior training. |
| Start from a pattern | `/templates` | Templates | Authenticated template gallery. |
| Review messages | `/inbox` | Inbox | Human review queue and response surface. |
| Review calls | `/call-logs` | Call logs | Call history, filters, transcripts, and outcomes. |
| Connect systems | `/connections` | Connections | Integrations and data handoff. |
| Account settings | `/settings` | Settings | Profile, security, product preferences. |
| App integrations | `/settings/apps` | Apps | Settings-owned app management. |
| Billing and usage | `/settings/billing` | Billing | Extension and workspace usage target. |
| Phone setup | `/settings/phone` | Phone | Number, routing, and Twilio-style provisioning surface. |
| Team access | `/settings/team` | Team | User and permission management. |

## Canonical public routes

| Route | Role |
| --- | --- |
| `/` | Primary marketing entry. |
| `/features` | Capability overview. |
| `/pricing` | Plans, conversation balance, and number provisioning story. |
| `/showcase` | Public examples and proof. |
| `/compare` | Alternatives and differentiation. |
| `/for/personal` | Personal wedge. |
| `/for/home-services` | Home services wedge. |
| `/for/medical` | Medical wedge. |
| `/for/legal` | Legal wedge. |
| `/for/real-estate` | Real estate wedge. |
| `/for/insurance` | Insurance wedge. |
| `/for/restaurants` | Restaurant wedge. |
| `/for/sales` | Sales wedge. |
| `/about` | Company story. |
| `/blog` | Editorial surface. |
| `/security` | Trust and security. |
| `/status` | Status and reliability. |
| `/support` | Help. |
| `/contact` | Contact. |
| `/privacy` | Privacy policy. |
| `/terms` | Terms. |

## Redirect policy

- `/login` redirects to `/signin`.
- `/reset` redirects to `/signin` until reset has a dedicated route.
- `/developers` redirects to `/features`.
- `/for/*` redirects to `/for/personal` when no supported wedge matches.
- `/blog/*` redirects to `/blog` until post routes exist.

## Cross-surface contract

Browser extension quick jumps must only target canonical workspace routes:

- Agent work -> `/studio`
- Training -> `/knowledge`
- Integrations -> `/connections`
- Usage or billing -> `/settings/billing`

Native apps should use the same language even when they do not deep-link to every route:

- Primary tab: `Run`
- Training label: `Train` or `Knowledge`, depending on context
- Operating headline: `Run the line`
- Agent state: `Training` until real voice/line configuration exists

## Retired routes and labels

Do not reintroduce:

- `/agents`
- `/actions`
- `Wire agent`
- `Open Wire Agent`
- fake readiness labels such as percentages without backend truth

## Test coverage expectation

`tests/e2e/routes.spec.ts` should include every route in the required launch set or a deliberate comment explaining why a route is excluded.
