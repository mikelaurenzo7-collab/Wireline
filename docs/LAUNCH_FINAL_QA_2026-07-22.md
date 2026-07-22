# Launch Final QA — 2026-07-22

Status: **Active** — production deploy unblock + hero polish + launch honesty.

## Vercel production blocked (root cause)

Deployments for squash-merge commits authored as GitHub user **`laurenzomike`**
were **BLOCKED**:

> Git author laurenzomike must have access to the project on Vercel to create deployments.

Preview builds authored as **`Cursor Agent` / `cursoragent`** succeed. Squash merges
onto `main` that attribute the commit to `laurenzomike` do not.

### Fix (ops — do one)

1. **Preferred:** Invite `laurenzomike` to the Vercel team `revaluate` with deploy rights  
   (invite link appears on the blocked deployment status), **or**
2. Keep shipping via Cursor Agent commits and **promote** READY previews with an
   authorized Vercel identity (`vercel promote <dpl_…> --yes`), **or**
3. Merge with merge commits from `cursor[bot]` (those have been promoting cleanly).

**Do not** paste Vercel tokens into DNC / other vendor env keys.

### Immediate recovery this pass

Promoted READY preview `dpl_GQvNXsXQnGYhw4qeQmfMcUFDLcNs` (visual-QA polish) to
production so trywireline.com is no longer stuck on a blocked `main` SHA.

## Federal DNC — business registration first

DNCScrub issues a real `loginId` only after business registration. Until then:

- Marketing / campaign dials stay **fail-closed** (by design).
- Studio non-marketing dials still use tenant DNC + TCPA.
- User-facing errors no longer dump env var names; Security page states the
  register-business → loginId → env path for operators.

Checklist: register entity → obtain DNCScrub `loginId` → set
`FEDERAL_DNC_API_URL` + `FEDERAL_DNC_API_KEY` on all Vercel targets →
`npm run dnc:probe`.

## Product polish shipped this pass

1. **Home hero** — single-line `YOUR NEXT AI EMPLOYEE` from `sm` up (`text-nowrap`,
   ~24ch); mobile uses ~11ch balanced two-line wrap (YOUR NEXT / AI EMPLOYEE).
2. **Pricing annual copy** — savings derived from catalog math (Starter = 1 month,
   not a false “save 2 months”).
3. **Federal DNC API message** — customer-safe fail-closed copy.
4. **product-event server contract** — `vi.hoisted()` mocks to stop CI flake.

## Success posture (bound constraints)

| Plane | Keep / do |
| --- | --- |
| Voice | Twilio + Vapi; shared `evaluateOutboundDialGate` |
| AI | OpenAI → Gemini → Gateway |
| Billing | Stripe Cadence catalog; honest annual savings |
| Video | LiveAvatar gated until Presence Catalog |
| Compliance | Federal DNC after business registration; fail-closed marketing |
| Deploy | Author must be Vercel-allowed; promote Cursor builds if needed |
