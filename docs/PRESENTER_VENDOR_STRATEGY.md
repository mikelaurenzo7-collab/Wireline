# Presenter & Presence Catalog Strategy

**Status:** Active (August 2026)  
**Audience:** Product, design, engineering  
**Related:** [WIRELINE_2026_ROADMAP.md](./WIRELINE_2026_ROADMAP.md), `src/lib/video-presenter/`, `src/lib/agent-identity.ts`

Wireline’s differentiation is **trusted agent presence**: a real line, a role, a voice, governed actions, proof of outcomes, and—only when it materially helps—a polished on-screen presenter for demos, recaps, explainers, content, kiosks, onboarding, and customer-facing media.

> Copy note: this document previously used “AI employee” as a product noun. The launch campaign guardrails forbid both employee-as-product-noun and pairing “AI” with “agent” in customer-facing copy. The wording here now matches `WIRELINE_LAUNCH_CAMPAIGN_2026-07-26.md`.

**Launch decision:** keep deterministic Wireline avatars, but only as **in-app identity badges**. They are useful for recognizing agents while using the product—Studio, training, analytics, call logs, mobile surfaces, and fallback states. They are **not** video presenters and should not be marketed as the product’s future face layer.

Customer surfaces must never name vendors. Operators may see **Identity badge**, **Professional Presence**, **Character Presence**, **Custom Presence**, **Live Presence**, **catalog presenter**, or **fallback identity**. Providers stay implementation details.

---

## Decision: can the speech vendor replace the video vendor?

**No — and the question is worth keeping answered, because the answer looks like it should be yes.**

The speech vendor ships an avatar product. It is **pre-rendered**: a script goes in, a finished talking-head video file comes out. That is a genuinely useful tool and it belongs in the creative pipeline. It is not a live conversation — there is no turn-taking, no interruption, no sub-second response, because there is no stream, only a render job.

Live Video is the opposite shape. A caller speaks, the agent answers within a beat, and the caller can cut it off mid-sentence. That needs a real-time renderer, which is what the video vendor is for. The speech vendor’s **own** integration documentation points at exactly that pairing rather than at itself.

So the two vendors are not competing for one slot; they occupy two:

| Job | Vendor | Why |
| --- | --- | --- |
| Live, interruptible on-screen conversation | Video vendor (real-time renderer) | Streaming lip-sync is the entire product |
| The voice and the conversation inside that session | Speech vendor | It orchestrates the audio; the renderer only draws |
| Pre-rendered creative — reels, explainers, recaps | **Speech vendor’s avatar product** | Script-in/file-out is the right shape, and it removes a render-quota dependency from the launch creative path |

**What this changes in practice.** Live minutes and creative renders must not share a quota. LiveAvatar credits and HeyGen credits do not transfer. Pre-rendered clips should use the HeyGen Video Agent / classic video APIs (`HEYGEN_API_KEY`) so they cannot starve Live Video sessions (`LIVEAVATAR_API_KEY`). Consolidating the *live* session onto HeyGen Video Agent is not available: that API returns an MP4, not an interruptible WebRTC stream.

**What to re-check, and what would change the answer.** A streaming, interruptible avatar on `api.heygen.com` that accepts Wireline PCM (or the tenant agent) would be an alternate renderer. HeyGen Avatar Realtime is HLS at about $0.05/sec and is still not that product. HeyGen's own Live Avatar docs point at `docs.liveavatar.com`. Re-check quarterly with the rest of the vendor pricing review.

Verified against the published documentation on 2026-08-16:

- **HeyGen Video Agent** (`POST /v3/video-agents`) is prompt-to-video. Default `mode: "generate"` is fire-and-forget; `mode: "chat"` pauses for storyboard review, not live talking. Pricing is about **$0.0333/sec** of finished video (~$2/min). Interactive sessions, styles, and brand kits are creative controls. This is the supply line for pre-rendered presence clips now that the API exists.
- **HeyGen look ids are not LiveAvatar session UUIDs.** `GET /v3/avatars/looks` feeds `POST /v3/videos` and `POST /v3/video-agents`. Live Video mint requires a public LiveAvatar UUID. Saving a look id as a live presenter is rejected (`avatarId` is UUID-only).
- **Shared `HEYGEN_API_KEY` is a workspace wallet.** Tenant minting is a multi-tenant blocker (same class of problem as workspace-level `LIVEAVATAR_VOICE_AGENT_ID`). `presenceClipMintOffered()` stays hard-false until per-tenant billing exists. See `src/lib/video-presenter/heygen-presence-clips.ts`.
- The speech vendor's own avatar product remains pre-rendered and is a second creative option when its API is offered; it is still not live conversation.
- The video vendor's speech-vendor connector requires a **paid** speech-vendor key (free-tier keys are blocked), registers the credential provider-side in exchange for an opaque secret id, outputs PCM 24 kHz, and **rejects per-session language overrides for speech-vendor-backed sessions with a 400** — which is why Wireline's payload builder never sends one.

The live integration Wireline implements is the officially documented pairing: a LITE-mode session where Wireline (or a connector) orchestrates audio and LiveAvatar renders. The speech credential is registered **with the video vendor**, which returns an opaque secret id; Wireline stores that id, never the raw key. When the agent's own phone voice is a PSTN-approved speech-vendor voice, the session passes it as the connector voice — the presenter speaks the same voice as the agent's live calls. See `src/lib/video-presenter/live-video-session-policy.ts` and the `LIVEAVATAR_ELEVENLABS_SECRET_ID` entry in `.env.example`.

**Scope boundary on the connector engines (decision, 2026-08-14).** The Studio-voice connector and FULL managed engine run against **workspace-level** provider identities (`LIVEAVATAR_ELEVENLABS_AGENT_ID`, `LIVEAVATAR_VOICE_AGENT_ID` / `LIVEAVATAR_CONTEXT_ID`) — one shared brain per deployment, not the tenant agent's Training. That is fine for the current founder/dogfood posture and the engine catalog copy now says so explicitly. It becomes a **multi-tenant blocker**: before these engines are offered beyond the founder workspace, either provision per-tenant provider agents or keep the engines operator-only, because pooled provider-side conversation history across tenants is not acceptable. The default Wireline-voice engine has no such issue — it runs the tenant's own agent brain end to end.

### Identity range: realistic through animated

The founder direction is a **range of agent identities, not one look**: deterministic badges for scanability, photoreal presenters where trust demands a human register, and deliberately animated characters where memorability beats realism. That maps onto surfaces that already exist plus one supply line to open:

| Identity register | Today | Supply line |
| --- | --- | --- |
| Deterministic badge | Live on every agent surface | Wireline SVG (owned) |
| Photoreal live presenter | Live Video catalog picker | Video vendor public catalog (LiveAvatar UUIDs only) |
| Animated / character live presenter | Possible now — curate stylized entries from the same catalog into the Characters tab | Video vendor catalog (curated subset), Tier 4 character pack |
| Pre-rendered presence clips (any register) | API exists; tenant product fail-closed | HeyGen Video Agent + classic video APIs on `HEYGEN_API_KEY`; optional speech-vendor avatars when that API is offered |

No new vendor is required for any row. The Characters lane is a curation task on the existing catalog plus the Tier 4 commissioning plan below. Presence clips must not be mixed into the live picker or billed as Live Video minutes.

---

## Product principle

No one buys a video agent because it has a face. They buy video when a watched, shared, embedded, explained, or remembered output improves the outcome.

Use app avatars for:

1. Quick recognition of agents in Studio, training, analytics, and call logs.
2. Compact visual anchors in mobile/browser UI.
3. Safe fallback when video presence is unavailable.
4. Internal continuity while the premium catalog is being built.

Use premium video presence for:

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
| Voice + LLM + PSTN | Vapi, OpenAI, Twilio | Wireline Phone, Voice library, Live |
| In-app avatar | Wireline SVG | Identity badge across app, training, analytics, and logs |
| On-screen video | LiveAvatar (HeyGen) LITE mode | Paid Live Video add-on for eligible business agents |
| Pre-rendered clips | HeyGen Video Agent / classic video | Fail-closed; not a tenant product until per-tenant billing exists |
| Presenter-matched voice | HeyGen speech API | Internal matching for catalog faces |
| PSTN with presenter voice | Falls back to a managed Wireline Phone (Vapi) voice | Routing hint in the voice picker; phone voice stays selectable in Studio |

Architecture: Wireline owns brains, telephony, permissions, consent, and outcomes; video vendors render approved presence assets. This split is correct — do not route PSTN audio through avatar vendors and do not build an in-house neural renderer before PMF.

---

## Presence supply chain

### Tier 1 — Licensed provider catalog presenters

Fastest path to non-amateur human faces, but only if aggressively curated.

Use for:

- Website demo agent.
- Onboarding guide.
- Product walkthroughs.
- Proposal and quote narrator.
- Support explainer.
- YouTube/short-form presenter.

Rules:

- Do not expose a messy vendor dump.
- Hide provider names in customer UI.
- Every card needs role fit, voice fit, style, preview asset, rights status, and approved use cases.
- Human-looking presenters must be premium enough to increase trust; otherwise do not show them.
- Until that bar is met, keep the picker paused and use app avatars only as identity badges.

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

Keep **Agent identity badges** separate from the future **Presence Picker**.

### Agent identity badge

- Always available.
- Deterministic per agent.
- Used inside the app only.
- Helps users distinguish agents while building, training, reviewing analytics, and scanning call logs.
- Not sold as a face clone, presenter, or human-like media output.

### Future Presence Picker

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

Synthesia, HeyGen classic video, HeyGen Video Agent, Runway — scripted or prompt-to-MP4 renders, not sub-second turn-taking. Useful for marketing, onboarding, proposals, recaps, social, and YouTube outputs.

**HeyGen Video Agent is this tier, not Tier A.** The product name sounds like a live Wireline agent. It is not: the provider owns scripting and rendering, output is a file, and IDs do not mint Live Video sessions. Wireline may use it later as a gated creative add-on; it must never replace LiveAvatar LITE + the tenant brain.

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

### Free / Starter — app identity badge

- Voice-first agent setup.
- Deterministic identity badge for navigation and recognition.
- No synthetic face marketing.
- No implied human/video presenter.

### Starter Plus / Pro — future Professional Presence

- Curated catalog presenters for async videos, demos, guided onboarding, and customer-facing content.
- Optional live preview where useful.
- No vendor names.
- Do not expose until the catalog is visually excellent.

### Business — Custom Presence

- “Your approved presence” request flow.
- Consent Vault required.
- Human review before going live.
- Deliverable: approved custom presenter tied to role, voice, phone line, permissions, and allowed use cases.

### Enterprise — BYO replica + policy

- Customer-uploaded training video.
- SSO audit trail.
- Retention and revocation controls.
- Optional provider failover by region/latency.

---

## Implementation backlog

1. **Keep avatars as app identifiers** — maintain deterministic badges for Studio, training, analytics, call logs, and mobile/browser surfaces.
2. **Remove presenter framing from app avatars** — no “face to your agent,” “photoreal,” “presenter catalog,” or video implication for the current SVG badges.
3. **Pause catalog pickers** — retain backend/provider abstractions, but hide/hold low-confidence catalog selection until the curated catalog is excellent.
4. **Presence Picker** — future Professional / Characters / Custom tabs, separate from app identity badges.
5. **Catalog abstraction** — `presence_catalog` model with preview asset, style, role fit, voice fit, provider metadata, rights/consent requirements, and approved use cases.
6. **Provider catalog curation** — list only approved high-quality human presenters.
7. **Character pack** — commission or generate a cohesive ET / futurist character set for playful brands and content.
8. **Consent Vault** — required before named-person clone or customer-uploaded likeness.
9. **Async video outputs** — HeyGen Video Agent API is the fail-closed supply line (`heygen-presence-clips.ts`); do not expose tenant minting until per-tenant billing exists. Use for post-call recap, proposal walkthrough, onboarding welcome, FAQ/social short.
10. **Conversation-to-content loop** — mine calls for recurring questions and turn them into YouTube/Shorts/Reels scripts and videos.
11. **Failover** — video unavailable → voice/text/identity badge with no broken WebRTC.
12. **Pricing** — Professional Presence included in higher plans; Custom Presence as setup fee or Business add-on.
13. **Funnel events** — `presence_picker_opened`, `professional_presence_selected`, `character_presence_selected`, `custom_presence_requested`, `presence_video_generated`, `clone_approved`.

---

## Anti-patterns

- Promoting current SVG avatars as video presenters.
- Removing app avatars entirely and making agent-heavy screens harder to scan.
- Mixing cheap cartoons with serious humans in one undifferentiated grid.
- Letting users casually clone a real person without a consent artifact.
- Making live video calls the core product when most users only need watched/shared video outputs.
- Showing vendor logos or provider labels in customer-facing UI.
- Shipping any human face that looks uncanny, cheap, or less trustworthy than no face.
- Building an in-house renderer before PMF.

---

## Launch posture

Until the premium catalog exists, Wireline should say:

> Voice agents are live today. App avatars help you recognize agents while you train, review, and operate them. Professional video presence is being curated for demos, recaps, explainers, content, and custom approved likenesses.

This protects trust while preserving the strategic path to a high-quality Presence Catalog.

*Refresh vendor pricing and catalog quality quarterly. Promote finalized supply-chain decisions into `ARCHITECTURE.md` when the catalog abstraction lands.*
