# Wireline Launch Creative Media Kit

Date: 2026-07-26  
Status: Active agent-first creative kit  
Related: `docs/WIRELINE_LAUNCH_CAMPAIGN_2026-07-26.md`

## Current Creative Doctrine

Wireline's public creative promise is **Voice Agents for personal and business conversations**. The market should immediately understand that Wireline can start with one useful agent and grow into a coordinated roster, without making personal plans feel like an afterthought.

Use:

- **Voice Agents**
- **Build your Voice Agent**
- **Build free. Go live from $19/mo.**
- **Personal + Business**
- **Voice + SMS + Email**
- **Create -> Train -> Wire -> Run**

Do not use:

- broad AI-employee hero copy
- one-employee public promises
- old best-employee slogans
- sub-$19 launch pricing

Business-context assets may use "AI employee" only when the placement is explicitly Business workspace or Business plan oriented.

## Brand System

| Element | Direction |
| --- | --- |
| Palette | Cool near-white or cool obsidian canvas, electric-violet action, platinum wire accent, restrained status colors |
| Mood | Premium, clear, operational, outcome-driven |
| Imagery | Concrete product scenes: call card, SMS follow-up, email draft, outcome log, approval/handoff |
| Typography | Crisp SaaS, high contrast, no novelty effects |
| Avoid | Purple blobs, beige/tan palettes, abstract bokeh, fake humanoid robots, generic call-center stock |

## Required Launch Assets

| Asset | Format | Copy |
| --- | --- | --- |
| `social/wireline-social-ai-voice-agents.png` | 1:1 | Voice Agents / Personal + Business |
| `social/wireline-social-missed-call.png` | 1:1 | Missed calls should not become lost revenue |
| `ads/wireline-ad-build-free-live-19.png` | 16:9 | Build free / Go live from $19/mo |
| `ads/wireline-ad-one-agent-every-channel.png` | 16:9 | One agent / voice + SMS + email |
| `stories/wireline-story-voice-agent.png` | 9:16 | Build your Voice Agent |
| `deck/wireline-founder-early-access.pdf` | 16:9 deck | Founder Early Access from $19/mo |
| `audio/wireline-ai-voice-agent-30s.mp3` | audio | AI Voice Generator campaign VO |
| `audio/wireline-missed-call-15s.mp3` | audio | 15s reel VO from the campaign pack ("Your agent can.") |
| `audio/wireline-founder-60s.mp3` | audio | 60s founder explainer VO from the campaign pack |
| [Launch Reel 46s (VO mixed)](https://share.descript.com/view/MvGqlYX4NMf) | 16:9 video master | Primary launch reel; product-first picture, approved VO, minimal text |

Legacy filenames containing `one-employee`, `employee`, `launch-9`, or `starter-9` are not publishable unless regenerated with the current copy above.

## Launch Reel Source of Truth

The 46-second [Descript master](https://share.descript.com/view/MvGqlYX4NMf) is the launch reel. Derivatives must preserve its approved voiceover, product sequence, timing, and price promise.

- Show the real product. No stock footage, mock dashboards, vendor logos, decorative captions, or extra claims.
- Burn in only four chapter words when they help orientation: **Create. Train. Wire. Run.**
- End card only: **Build free. Go live from $19/mo.** and **trywireline.com**.
- Provide accurate platform captions as a selectable accessibility track. Do not stack persistent subtitles over already legible product UI.
- Cut 9:16 and 1:1 variants from the 16:9 master by reframing the active UI, never by shrinking the full desktop canvas into unreadable space.

### Re-cutting the picture

`npm run marketing:kit` records the picture for all three cuts. It captures the
live product, so **the footage expires whenever the product's design changes** —
a reel cut before a type or layout change shows a product that no longer exists.

```bash
npm run build && node -e "require('./dist/server.cjs')"   # serve the real bundle
E2E_BASE_URL=http://127.0.0.1:3000 MARKETING_USE_MOCKS=1 npm run marketing:kit
```

| Capture | Frame | Scene map |
| --- | --- | --- |
| `videos/reel-46s-master-walkthrough.webm` | 1920×1080 | home → overview → studio → knowledge → number → outbound (dial modal) → email → call log |
| `videos/reel-30s-product-loop.webm` | 1080×1920 | Create → Train → Wire → Run |
| `videos/reel-15s-missed-call.webm` | 1080×1920 | call log → outbound dial modal → inbox |

Each beat is a hold long enough to cut from; the editor trims down, never
stretches up. Scrolls are eased across twelve steps rather than jumped, so the
motion matches what a person sees.

Two rules the capture enforces rather than trusts:

- **Copy comes from the campaign document.** `copy/social-copy.md` is generated
  from the Brand Spine in `docs/WIRELINE_LAUNCH_CAMPAIGN_2026-07-26.md`. Edit the
  document, re-run the kit; never edit the generated file. It previously
  hardcoded its own hooks, which had drifted to naming three competitors — against
  the doctrine above — and to omitting the price line entirely.
- **No reel films `/compare`.** It is the one route that renders vendor marks.

## Plugin-Ready Design Briefs

### Canva / Adobe Express Static Ad

Prompt: Create a premium SaaS launch ad for Wireline. Headline: "Voice Agents". Subhead: "Personal + Business. Voice + SMS + Email." CTA: "Build free. Go live from $19/mo." Use a clean product-interface composition with an incoming call, SMS confirmation, and logged outcome. Use electric-violet accents, cool near-white or obsidian canvas, platinum wire detail, crisp type, and no generic stock photos.

### Adobe Firefly Product Scene

Prompt: A realistic premium SaaS workspace scene showing a laptop with a clean voice-agent dashboard, incoming call card, SMS follow-up, and outcome log. Modern founder/operator desk, subtle platinum wire accent, electric-violet UI highlight, professional lighting, no visible brand names except Wireline if text is supported.

### HeyGen / HyperFrames Founder Video

Prompt: Produce a 60-second founder-style launch video for Wireline using the 60-second founder explainer voiceover from `docs/WIRELINE_LAUNCH_CAMPAIGN_2026-07-26.md` word for word. Tone: confident, warm, practical - a founder explaining their product to a friend, not an announcer. Visuals: real product footage of create, train, wire, and run. End card: Build your Voice Agent at trywireline.com.

### BlitzReels Short Cut

Prompt: Cut a 15-second 9:16 derivative from the approved 46-second Descript master. Use only real product footage: answer -> follow up -> logged outcome -> end card. Keep the approved VO phrases in order. No persistent overlays or vendor marks. Use platform captions for accessibility. End card: "Build free. Go live from $19/mo." and "trywireline.com".

### Beautiful.ai Deck

Prompt: Build a concise 6-slide launch deck for Wireline: 1) Voice Agents, 2) Missed calls are expensive, 3) Create -> Train -> Wire -> Run, 4) Personal + business use cases, 5) Founder Early Access from $19/mo, 6) Build your Voice Agent.

## AI Voice Generator Asset

This voiceover was generated for promotion/reference only. It is not approved as a production runtime phone-call voice.

- Preview: https://storage.googleapis.com/adm--audio-playback--7d--public/mcp-preview/ec315585-89bf-4b2b-ad7f-7e30bb50d5fd.mp3
- Full audio: https://www.aidocmaker.com/g0/audio?name=acdf9b5a628e4558923c63ba0ed2d821
- Script: "Missed calls should not become lost revenue. Wireline helps you build voice agents for personal tasks and business conversations. Start with one agent, train it on your rules, connect calls, texts, and email, and let it handle the next conversation with every outcome logged. Build free. Go live from nineteen dollars a month at trywireline dot com."

## Placement Plan

| Channel | Asset | Notes |
| --- | --- | --- |
| Homepage / pricing support | 16:9 Voice Agents banner | Align with current metadata and product-copy constants |
| LinkedIn organic | Founder post + 16:9 banner | Promote founder early access, not public WhatsApp |
| X / Twitter | Short text + 1:1 missed-call image | Drive to signup/pricing with v6 UTM |
| Meta / LinkedIn ads | 16:9 build-free-live-19 and 1:1 Voice Agents | Start only after phone and payment loops are verified |
| Reels / Shorts | 46s master + 15s 9:16 cut | Real product, minimal chapter words, selectable captions, one end card |
| Sales deck | 6-slide deck | Use for warm founder outreach and early adopters |
