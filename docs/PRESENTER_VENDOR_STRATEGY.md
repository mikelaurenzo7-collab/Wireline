# Presenter & Presence Catalog Strategy

**Status:** Active (July 2026)  
**Audience:** Product, design, engineering  
**Related:** [WIRELINE_2026_ROADMAP.md](./WIRELINE_2026_ROADMAP.md), `src/lib/video-presenter/`, `src/lib/agent-identity.ts`

Wireline’s differentiation is **trusted AI employee presence**: a real line, a role, a voice, governed actions, proof of outcomes, and—only when it materially helps—a polished on-screen presenter for demos, recaps, explainers, content, kiosks, and onboarding.

**Launch decision:** the current deterministic synthetic/SVG face system is no longer a flagship customer-facing identity experience. It may remain as a hidden fallback for resilience, but it should not be promoted as the product’s face layer until Wireline has a flawless premium catalog.

Customer surfaces must never name vendors. Operators see **Professional Presence**, **Character Presence**, **Custom Presence**, **Live Presence**, **catalog presenter**, or **fallback identity**. Providers stay implementation details.

---

## Product principle

No one buys a video agent because it has a face. They buy video when a watched, shared, embedded, explained, or remembered output improves the outcome.

Use presence for:

1. Async sales, onboarding, proposal, quote, and post-call videos.
2. Product demos and screen explainers.
3. YouTube, Shorts, Reels, TikTok, LinkedIn, and FAQ content.
4. Website, kiosk, lobby, booth, or QR-code presenter experiences.
5. Premium brand identity characters.

Do **not** make live video calls the default product center. Voice and phone remain the work engine; video becomes a premium media and presence layer.

---

## What we ship today

| Layer | Provider (internal) | Customer experience |
| --- | --- | --- |
| Voice + LLM + PSTN | Vapi, ElevenLabs, xAI | Wireline Phone, Voice library, Live |
| On-screen video | LiveAvatar (HeyGen) LITE mode | Catalog presenter + live lip-sync in Studio |
| Presenter-matched voice | HeyGen speech API | Lip-sync aligned preview |
| PSTN with presenter voice | Falls back to ElevenLabs | Disclosed in voice picker + Studio banner |
| Synthetic SVG face | Wireline fallback | Hidden fallback only; do not sell as premium identity |

Architecture: Wireline owns brains, telephony, permissions, consent, and outcomes; video vendors render approved presence assets. This split is correct — do not route PSTN audio through avatar vendors and do not build an in-house neural renderer before PMF.

---

## Presence supply chain

### Tier 1 — Licensed provider catalog presenters

Fastest path to non-amateur human faces.

Use for:

- Website demo agent.
- Onboarding guide.
- Product walkthroughs.
- Proposal and quote narrator.
- Support explainer.
- YouTube/short-form presenter.

Rules:

- Curate aggressively; do not expose a messy vendor dump.
- Hide provider names in customer UI.
- Every card needs role fit, voice fit, style, and preview asset.
- Human-looking presenters must be premium enough to increase trust; otherwise do not show them.

### Tier 2 — Wireline-owned professional presenter pack

Commission or license 8–12 cohesive human presenters with model releases and AI likeness rights.

Initial pack:

- Ava — Front Desk.
- Sarah — Scheduler.
- Liam — Sales Concierge.
- Maya — Support Desk.
- Noor — Intake.
- Marcus — Operations.
- Elena — Concierge.
- Theo — Training.

Required asset record:

- Signed commercial model release.
- AI likeness permission.
- Allowed use cases.
- Voice rights if bundled.
- Source footage and still preview.
- Provider avatar IDs.
- Consent and revocation terms.

### Tier 3 — Custom customer presence

For businesses that want an owner, founder, receptionist, salesperson, doctor’s-office representative, broker, or spokesperson.

This requires a Consent Vault before launch:

- Requested by.
- Person represented.
- Source media.
- Allowed uses.
- Expiration / revocation.
- Provider used.
- Avatar and voice IDs.
- Approval status.
- Audit trail.

Status lifecycle:

`not_started → submitted → pending_review → approved → live → revoked`

Never allow casual named-person cloning without approval.

### Tier 4 — Wireline Character Presence

A deliberate premium character lane, not random cartoons.

Examples:

- Orion — friendly ET concierge.
- Nova — sales spark.
- Echo — support entity.
- Vanta — calm operator.
- Copper — retro switchboard bot.
- Luma — training guide.
- Finch — personal assistant.
- Relay — technical explainer.

Use for:

- Creator/social content.
- Personal assistants.
- Fun demos.
- Education/training roleplay.
- Restaurants, entertainment, events, and brands that want memorability.

---

## Product catalog model

Replace “avatar picker” with **Presence Picker**.

Tabs:

1. **Professional** — polished licensed or Wireline-owned human presenters.
2. **Characters** — intentional ET / sci-fi / mascot-style Wireline characters.
3. **Custom** — approved likeness requests for higher tiers.

Every presence card should include:

- Name.
- Style: professional, character, custom.
- Best-fit roles.
- Voice compatibility.
- Preview image/video.
- Usage availability.
- Consent requirements.
- Provider routing metadata hidden from customers.

---

## Market map (live conversational avatars)

### Tier A — Production APIs (evaluate for Wireline)

| Vendor | Custom face clone | Real-time | Typical cost | Best for |
| --- | --- | --- | --- | --- |
| **LiveAvatar** (current) | 2 min video + consent | WebRTC, LITE + FULL | ~$0.10–0.20/min | Highest visual fidelity; already integrated |
| **Tavus CVI** | Replica from ~2 min footage | WebRTC (Daily/LiveKit) | ~$0.32/min | Named-person clones (exec, instructor, creator) |
| **Simli** | Custom from short clip | WebRTC, low latency | Variable | Cost-sensitive, high concurrency |
| **Anam** | Stock + custom tiers | Claims ~180ms e2e | Variable | Speed-first conversations |
| **D-ID Agents** | ~2 min upload | WebSocket / WebRTC | ~$0.35/min | Enterprise familiarity |
| **Beyond Presence, bitHuman, LemonSlice** | Varies | WebRTC | Varies | Niche / emerging |

### Tier B — Video-only (not live agents)

Synthesia, HeyGen classic video, Runway — scripted renders, not sub-second turn-taking. Useful for marketing, onboarding, proposals, recaps, social, and YouTube outputs.

### Tier C — Build your own

| Approach | Realism | Latency | Cost to build | Verdict |
| --- | --- | --- | --- | --- |
| Wav2Lip / MuseTalk on static portrait | Medium | Hard at scale | High eng | Prototype only |
| Gaussian splatting (Simli-style) | Medium–high | Good | Very high | Partner vs build |
| Full neural renderer | High | Hard | Research-grade | Not 2026 MVP |
| **LiveKit agent + avatar plugin** | Depends on plugin | Good | Medium | Recommended orchestration layer if we add failover |

**Recommendation:** Do not build a custom face renderer in 2026. Build the provider abstraction, Consent Vault, and catalog quality layer. Integrate one primary catalog provider and one named-clone specialist only after the UX is premium.

---

## Product tiers

### Free / Starter — no promoted face layer

- Voice-first agent setup.
- Wireline face may appear only as a small fallback or neutral placeholder.
- No synthetic face marketing.

### Starter Plus / Pro — Professional Presence

- Curated catalog presenters for async videos, demos, and guided onboarding.
- Optional live preview where useful.
- No vendor names.

### Business — Custom Presence

- “Your approved presence on the line” request flow.
- Consent Vault required.
- Human review before going live.
- Deliverable: approved custom presenter tied to role, voice, phone line, and permissions.

### Enterprise — BYO replica + policy

- Customer-uploaded training video.
- SSO audit trail.
- Retention and revocation controls.
- Optional provider failover by region/latency.

---

## Implementation backlog

1. **Demote synthetic faces** — remove amateur deterministic faces from prominent customer UX; retain only hidden fallback internals.
2. **Presence Picker** — replace “avatar picker” language with Professional / Characters / Custom tabs.
3. **Catalog abstraction** — `presence_catalog` model with preview asset, style, role fit, voice fit, provider metadata, consent requirements.
4. **Provider catalog curation** — list only approved high-quality human presenters.
5. **Character pack** — commission or generate a cohesive ET / futurist character set for playful brands and content.
6. **Consent Vault** — required before named-person clone or customer-uploaded likeness.
7. **Async video outputs** — post-call recap, proposal walkthrough, onboarding welcome, FAQ/social short.
8. **Conversation-to-content loop** — mine calls for recurring questions and turn them into YouTube/Shorts/Reels scripts and videos.
9. **Failover** — video unavailable → voice/text/fallback identity with no broken WebRTC.
10. **Pricing** — Professional Presence included in higher plans; Custom Presence as setup fee or Business add-on.
11. **Funnel events** — `presence_picker_opened`, `professional_presence_selected`, `character_presence_selected`, `custom_presence_requested`, `presence_video_generated`, `clone_approved`.

---

## Anti-patterns

- Promoting current synthetic faces as the product’s identity layer.
- Mixing cheap cartoons with serious humans in one undifferentiated grid.
- Letting users casually clone a real person without a consent artifact.
- Making live video calls the core product when most users only need watched/shared video outputs.
- Showing vendor logos or provider labels in customer-facing UI.
- Shipping any human face that looks uncanny, cheap, or less trustworthy than no face.
- Building an in-house renderer before PMF.

---

## Launch posture

Until the premium catalog exists, Wireline should say:

> Voice-first AI employees are live today. Professional video presence is being curated for demos, recaps, explainers, content, and custom approved likenesses.

This protects trust while preserving the strategic path to a high-quality Presence Catalog.

*Refresh vendor pricing and catalog quality quarterly. Promote finalized supply-chain decisions into `ARCHITECTURE.md` when the catalog abstraction lands.*