# Presenter & Face Clone Vendor Strategy

**Status:** Active (July 2026)  
**Audience:** Product, design, engineering  
**Related:** [WIRELINE_2026_ROADMAP.md](./WIRELINE_2026_ROADMAP.md), `src/lib/video-presenter/`

Wireline’s differentiation is **live voice + on-screen presenter** on the **Letterpress** canvas (warm ink, forest action, copper wire). Customer surfaces never name vendors — operators see **presenter**, **live video add-on**, and **catalog face**.

---

## What we ship today

| Layer | Provider (internal) | Customer experience |
| --- | --- | --- |
| Voice + LLM + PSTN | Vapi, ElevenLabs, xAI | Wireline Phone, Voice library, Live |
| On-screen video | **LiveAvatar** (HeyGen) LITE mode | Catalog face + live lip-sync in Studio |
| Presenter-matched voice | HeyGen speech API | Lip-sync aligned preview |
| PSTN with presenter voice | Falls back to ElevenLabs | **Disclosed** in voice picker + Studio banner |

Architecture: Wireline owns brains and telephony; LiveAvatar renders WebRTC video into LiveKit. This split is correct — do not route PSTN audio through avatar vendors.

---

## Market map (live conversational avatars)

### Tier A — Production APIs (evaluate for Wireline)

| Vendor | Custom face clone | Real-time | Typical cost | Best for |
| --- | --- | --- | --- | --- |
| **LiveAvatar** (current) | 2 min video + consent | WebRTC, LITE + FULL | ~$0.10–0.20/min | Highest visual fidelity; already integrated |
| **Tavus CVI** | Replica from ~2 min footage | WebRTC (Daily/LiveKit) | ~$0.32/min | **Named-person clones** (exec, instructor, creator) |
| **Simli** | Custom from short clip | WebRTC, low latency | Variable | Cost-sensitive, high concurrency |
| **Anam** | Stock + custom tiers | Claims ~180ms e2e | Variable | Speed-first conversations |
| **D-ID Agents** | ~2 min upload | WebSocket / WebRTC | ~$0.35/min | Enterprise familiarity |
| **Beyond Presence, bitHuman, LemonSlice** | Varies | WebRTC | Varies | Niche / emerging |

### Tier B — Video-only (not live agents)

Synthesia, HeyGen classic video, Runway — scripted renders, not sub-second turn-taking. Useful for marketing assets, not Wireline’s core loop.

### Tier C — Build your own

| Approach | Realism | Latency | Cost to build | Verdict |
| --- | --- | --- | --- | --- |
| Wav2Lip / MuseTalk on static portrait | Medium | Hard at scale | High eng | Prototype only |
| Gaussian splatting (Simli-style) | Medium–high | Good | Very high | Partner vs build |
| Full neural renderer | High | Hard | Research-grade | Not 2026 MVP |
| **LiveKit agent + avatar plugin** | Depends on plugin | Good | Medium | **Recommended orchestration layer** if we add Tavus/Simli failover |

**Recommendation:** Do not build a custom face renderer in 2026. Build a **provider abstraction** + consent workflow; integrate 1 primary (LiveAvatar) + 1 clone specialist (Tavus) for Business tier.

---

## Product tiers (design + GTM)

### Personal / Team — Catalog presenter

- Pick from **stock catalog faces** (already in Fast Start face picker).
- Presenter voice matched for Studio lip-sync.
- PSTN honesty banner when phone line is wired.

**Signature moment:** First browser preview — face speaks with matched voice on ink canvas.

### Business — Custom presence (next)

- **“Your presence on the line”** upsell — not “upload a video.”
- Guided consent: identity, usage rights, 2-minute capture checklist, approval state (`consentStatus` already in schema).
- Behind the scenes: LiveAvatar custom avatar API **or** Tavus replica for named clones.
- Deliverable: same Studio experience, custom `chosenAvatarId`.

**Design rules (Letterpress):**

- Copper wire accent on “custom presence” CTA — not generic purple SaaS.
- Consent screens on warm paper optional mode for legal clarity.
- Never show vendor logos; show **approval status** chips (Pending · Approved · Live).

### Enterprise — BYO replica + policy

- Customer-uploaded training video, SSO audit trail, data retention controls.
- Optional **failover**: avatar unavailable → voice + text (Docket pattern).
- Multi-provider routing by region/latency.

---

## Provider selection matrix (for Wireline)

| Criterion | LiveAvatar | Tavus | Simli |
| --- | --- | --- | --- |
| Already in repo | ✅ | ❌ | ❌ |
| Visual fidelity | Excellent | Excellent | Good |
| Named-person clone | ✅ | ✅✅ (core strength) | ✅ |
| LiveKit plugin | ✅ | ✅ | ✅ |
| Fits split stack (BYO voice) | ✅ LITE | ✅ | ✅ |
| Concurrency economics | Strong | Moderate | Strong |
| Perception / emotion | Basic | Raven-1 multimodal | Basic |

**2026 H1:** Stay on LiveAvatar; add Tavus as optional Business clone path.  
**2026 H2:** Evaluate Simli for cost-sensitive high-concurrency tier.

---

## Implementation backlog

1. **PSTN honesty** — Studio banner when `voiceProvider === presenter` (shipped in this pass).
2. **Consent wizard** — Business tier: capture → pending → approved → `chosenAvatarId`.
3. **Provider interface** — `VideoPresenterBackend` with `liveavatar` | `tavus` | `synthetic`.
4. **Failover** — Session start failure → voice-only Studio mode, no broken WebRTC.
5. **Pricing** — Custom presence as Business add-on; document COGS per minute per provider.
6. **Funnel events** — `presenter-preview-started`, `custom-presence-requested`, `clone-approved`.

---

## Anti-patterns

- Promising “same face on phone” until PSTN pipeline supports presenter audio path.
- Vendor names on customer UI or marketing (competitor table may reference category, not Wireline UX).
- Stock-photo avatar grids without brand — use Letterpress catalog cards with copper selection ring.
- Building in-house lip-sync before product-market fit on catalog presenters.

---

*Refresh vendor pricing quarterly. Promote decisions into `ARCHITECTURE.md` when provider abstraction lands.*
