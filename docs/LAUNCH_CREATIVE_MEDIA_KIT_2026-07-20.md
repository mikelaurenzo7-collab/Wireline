# Wireline Launch Creative Media Kit

Date: 2026-08-10  
Status: Active creative kit; published reels require source-commit certification  
Related: `docs/WIRELINE_LAUNCH_CAMPAIGN_2026-07-26.md`

**Who owns what.** The campaign document owns copy: the Brand Spine, every voiceover script, and every cut's shot list, timing, and mix. This kit owns delivery: the asset manifest, the capture-and-certification workflow, the tool briefs, and the placement plan. When the two disagree, the campaign document wins and this file is the bug — that is how the retired missed-call hook survived here for two weeks after it was retired there.

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
| `social/wireline-social-missed-call.png` | 1:1 | Every missed call is someone trying the next name on the list |
| `ads/wireline-ad-build-free-live-19.png` | 16:9 | Build free / Go live from $19/mo |
| `ads/wireline-ad-one-agent-every-channel.png` | 16:9 | One agent / voice + SMS + email |
| `stories/wireline-story-voice-agent.png` | 9:16 | Build your Voice Agent |
| `deck/wireline-founder-early-access.pdf` | 16:9 deck | Founder Early Access from $19/mo |
| `audio/wireline-ai-voice-agent-30s.mp3` | audio | "The Second Ring" hero narration — 24 words entering at 0:20, **not** the retired four-verb walkthrough |
| `audio/wireline-missed-call-15s.mp3` | audio | 15s reel VO from the campaign pack ("Your agent can.") |
| `audio/wireline-founder-60s.mp3` | audio | 60s founder explainer VO from the campaign pack |
| [Published Launch Reel 46s (VO mixed)](https://share.descript.com/view/MvGqlYX4NMf) | 16:9 edit | Published August 1 cut; release-current only when its delivery record certifies the deployed source commit |

Video cuts are briefed in `docs/WIRELINE_LAUNCH_CAMPAIGN_2026-07-26.md`, which owns their shot lists, timings, and mix rules. The deliverables:

| Cut | Length | Slot | Blocking issue |
| --- | --- | --- | --- |
| "The Second Ring" hero | 30s | Primary paid social | Needs a real captured booking call mixed forward — a capture task, not an edit |
| "Two Rings" bumper | 6s | YouTube bumper, Reels/TikTok scroll-stop | Same captured call; no VO needed |
| Missed-call cutdown | 15s | Paid social | Delivered file runs 16.80s and mixes the agent low; both violate the brief |
| Product walkthrough | 30s | Sales, onboarding, docs | Alternate cut — not for paid social |
| Descript master | 46s | Long-form, founder | Not yet re-cut; founder-60s VO is ready for it |

Every paid cut ships in **two mixes**: sound-on as briefed, and sound-off with the Studio live-transcript segment extended so a muted viewer can read the agent's words. Most paid social plays muted, and the hero and bumper both stake everything on audio.

Legacy filenames containing `one-employee`, `employee`, `launch-9`, or `starter-9` are not publishable unless regenerated with the current copy above.

### Retired copy — do not ship

The campaign document retires lines as the creative sharpens. Retired copy has a habit of surviving in asset tables and design prompts long after the decision, so it is listed here and pinned by `tests/launch-creative-consistency-contract.test.ts`.

| Retired | Use instead | Why |
| --- | --- | --- |
| "Missed calls should not become lost revenue." | "Every missed call is someone trying the next name on the list." | A principle, not a moment. It states a truism the viewer already agrees with and gives them nothing to picture; the replacement names the person walking away. |
| The four-verb walkthrough script in the 30s slot | "The Second Ring" hero narration | The 30s slot is now the hero cut. Its narration is 24 words entering at 0:20; the rest is captured agent audio and silence. |

## Launch Reel Source of Truth

The [Descript share](https://share.descript.com/view/MvGqlYX4NMf) is the currently published edit, not proof that its picture matches current production. A reel is **release-current** only when its delivery record includes the exact `sourceCommit` from `marketing-kit/release-record.json` and that SHA matches the production deployment being promoted. An older published link remains a historical edit until it is re-cut and recertified.

Derivatives must preserve the approved voiceover, product sequence, timing, and price promise while using picture certified against the current production source commit.

- Show the real product. No stock footage, mock dashboards, vendor logos, decorative captions, or extra claims.
- Keep burned-in words scarce. The walkthrough cut uses four chapter words — **Create. Train. Wire. Run.** — and the hero and bumper carry their own briefed overlays. Anything not in a cut's shot list does not go on screen.
- Every end card carries **Build free. Go live from $19/mo.** and **trywireline.com**. The hero and bumper open theirs with **Nobody went to voicemail.**
- **Let the agent be heard.** Every cut must contain at least one stretch of real captured agent audio at full level, with no voiceover and no music under it. We sell a voice product, and the buyer's real objection is that their customers will know it is a bot; nothing in a deck answers that, and mixing the agent low throws away the only asset that does.
- Provide accurate platform captions as a selectable accessibility track. Do not stack persistent subtitles over already legible product UI.
- Cut 9:16 and 1:1 variants from the 16:9 master by reframing the active UI, never by shrinking the full desktop canvas into unreadable space.
- Do not publish when `release-record.json.sourceCommit` differs from the deployed production SHA. Re-run the capture, inspect the frames, and update the delivery record first.

### Re-cutting and certifying the picture

`npm run marketing:kit` records and certifies the picture for all three cuts. It captures the live product, so **the footage expires whenever the product's design changes** — a reel cut before a type or layout change shows a product that no longer exists.

```bash
npm run build && node -e "require('./dist/server.cjs')"   # serve the real bundle
E2E_BASE_URL=http://127.0.0.1:3000 MARKETING_USE_MOCKS=1 npm run marketing:kit
```

The command runs the raw Playwright capture, then:

- records the exact 40-character Git source commit and ref;
- verifies all declared assets exist;
- requires all three intended video captures and rejects implausibly empty files;
- hashes every authenticated screenshot and rejects duplicate route frames, the signature of an auth wall, redirect, or shared error screen;
- writes the evidence to `marketing-kit/manifest.json` and the portable delivery proof to `marketing-kit/release-record.json`.

Use `npm run marketing:kit:raw` only while debugging the capture script. Raw output is not release-certified.

### Raw-source visual acceptance

Certification proves provenance and distinct routes; it does not replace frame review. Before any source capture moves into Descript, CapCut, Premiere, or a platform upload:

- confirm every held scene is the intended product surface, not the sign-in wall, authenticated 404, or shared error screen;
- trim route-loading transitions from the edit rather than presenting them as product beats;
- verify modal, dropdown, sheet, and select content remains centered and visible after portal styling changes;
- reframe vertical cuts around the active UI; a full desktop shell surrounded by unused 9:16 space is source footage, not a publishable vertical composition;
- confirm the finished edit meets its named duration and includes the approved end card;
- treat any route named in the scene map as a release contract. `tests/launch-completeness-contract.test.ts` fails in the mandatory Vercel gate when a beat no longer exists in the authenticated router.

The August 2 source review found the 15-second raw capture holding on an authenticated 404 because its historical `/email` beat no longer existed after Inbox moved to `/inbox`. The application now preserves `/email` as a redirect to `/inbox` for old links and historical capture instructions. Existing affected footage remains rejected; re-run the kit on the certified source commit.

| Capture | Frame | Scene map |
| --- | --- | --- |
| `videos/reel-46s-master-walkthrough.webm` | 1920×1080 | home → overview → studio → knowledge → number → outbound (dial modal) → inbox/email → call log |
| `videos/reel-30s-product-loop.webm` | 1080×1920 | Create → Train → Wire → Run |
| `videos/reel-15s-missed-call.webm` | 1080×1920 | call log → outbound dial modal → inbox/email |

Each beat is a hold long enough to cut from; the editor trims down, never stretches up. Scrolls are eased across twelve steps rather than jumped, so the motion matches what a person sees.

Two rules the capture enforces rather than trusts:

- **Copy comes from the campaign document.** `copy/social-copy.md` is generated from the Brand Spine in `docs/WIRELINE_LAUNCH_CAMPAIGN_2026-07-26.md`. Edit the document, re-run the kit; never edit the generated file. It previously hardcoded its own hooks, which had drifted to naming three competitors — against the doctrine above — and to omitting the price line entirely.
- **No reel films `/compare`.** It is the one route that renders vendor marks.

## Plugin-Ready Design Briefs

### Canva / Adobe Express Static Ad

Prompt: Create a premium SaaS launch ad for Wireline. Headline: "Voice Agents". Subhead: "Personal + Business. Voice + SMS + Email." CTA: "Build free. Go live from $19/mo." Use a clean product-interface composition with an incoming call, SMS confirmation, and logged outcome. Use electric-violet accents, cool near-white or obsidian canvas, platinum wire detail, crisp type, and no generic stock photos.

### Adobe Firefly Product Scene

Prompt: A realistic premium SaaS workspace scene showing a laptop with a clean voice-agent dashboard, incoming call card, SMS follow-up, and outcome log. Modern founder/operator desk, subtle platinum wire accent, electric-violet UI highlight, professional lighting, no visible brand names except Wireline if text is supported.

### HeyGen / HyperFrames Founder Video

Prompt: Produce a 60-second founder-style launch video for Wireline using the 60-second founder explainer voiceover from `docs/WIRELINE_LAUNCH_CAMPAIGN_2026-07-26.md` word for word. Tone: confident, warm, practical - a founder explaining their product to a friend, not an announcer. Visuals: real product footage of create, train, wire, and run. End card: Build your Voice Agent at trywireline.com.

### BlitzReels Short Cut

Cut the 15-second 9:16 derivative to the shot list in `docs/WIRELINE_LAUNCH_CAMPAIGN_2026-07-26.md` → *15-Second Reel — Missed Call*, which owns its timings, overlays, and mix. Summarised: real product footage only, no vendor marks, platform captions for accessibility, and the agent forward at full level from 5.0-8.0 with the narration ducking under it. Two overlays are briefed and required — **You cannot pick up.** then **Your agent can.** — because that contrast is the ad. End card: "Build free. Go live from $19/mo." and "trywireline.com".

### Beautiful.ai Deck

Prompt: Build a concise 6-slide launch deck for Wireline: 1) Voice Agents, 2) Missed calls are expensive, 3) Create -> Train -> Wire -> Run, 4) Personal + business use cases, 5) Founder Early Access from $19/mo, 6) Build your Voice Agent.

## Voiceover masters

`npm run campaign:vo` renders every VO from the canonical scripts in the campaign document, into gitignored `official-assets/audio/`. `tests/launch-campaign-vo-contract.test.ts` pins the generator's copy to the document, so the audio can never read a script the reels were not timecoded against. Regenerate whenever campaign copy changes — the renders are build artifacts, not repository content.

All campaign audio is **marketing and reference use only**. Production phone-call speech goes through the managed voice runtime, never through campaign assets.

### Superseded — reference only

The original AI Voice Generator preview reads the retired hook and the retired four-verb script. It is kept for provenance and must not be laid over any current cut.

- Preview: https://storage.googleapis.com/adm--audio-playback--7d--public/mcp-preview/ec315585-89bf-4b2b-ad7f-7e30bb50d5fd.mp3
- Full audio: https://www.aidocmaker.com/g0/audio?name=acdf9b5a628e4558923c63ba0ed2d821

## Placement Plan

| Channel | Asset | Notes |
| --- | --- | --- |
| Homepage / pricing support | 16:9 Voice Agents banner | Align with current metadata and product-copy constants |
| LinkedIn organic | Founder post + 16:9 banner | Promote founder early access, not public WhatsApp |
| X / Twitter | Short text + 1:1 missed-call image | Drive to signup/pricing with v6 UTM |
| Meta / LinkedIn ads | 16:9 build-free-live-19 and 1:1 Voice Agents | Start only after phone and payment loops are verified |
| Reels / Shorts | 46s master + 15s 9:16 cut | Real product, minimal chapter words, selectable captions, one end card |
| Sales deck | 6-slide deck | Use for warm founder outreach and early adopters |
