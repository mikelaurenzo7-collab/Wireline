# Wireline Launch Creative & Media Kit

Status: **Active** — creative doctrine + inventory for trywireline.com promotion.
Binaries (PNG/MP4/WebM) are **not** committed to git (CODEBASE_HEALTH). Download the packaged
agent artifact ZIP from the launch pass, or regenerate with the shotlist below.

Companion planning: `docs/LAUNCH_GURU_PLAYBOOK_2026-07-20.md`.

---

## Brand system (Letterpress / Aurora)

| Token | Hex | Use |
| --- | --- | --- |
| Obsidian canvas | `#0A0A0E` | Backgrounds |
| Near-white | `#F5F4F8` | Primary type |
| Secondary text | `#B6B1C6` | Subcopy |
| Electric violet | `#A78BFA` | Sole action / CTA |
| Platinum wire | `#C7CCD6` | Signal accent (not a palette dump) |
| Success / warn / error | `#4ADE9A` / `#E8B85C` / `#EF7B92` | Status only |

**Fonts (live tokens):** Inter Tight (display) · Inter (body) · IBM Plex Mono (labels).
**Spine:** Wire → Work → Win. **Tone:** calm, precise, useful. No forest/copper, no trial language, no fake metrics.

### Canonical copy

- North star: *The best employee you've ever had, for next to nothing.*
- Hero: *Your next AI employee*
- Sub: *One trained employee handles customer conversations across voice, SMS, and email—then follows up, books the next step, and logs every outcome.*
- Pricing hero: *Build Free. Launch for $9. Scale When It Pays.*
- CTAs: `Start free` · `Launch for $9/mo` · `Hear a demo` · `Build your AI employee`
- Domain: trywireline.com · Support: support@trywireline.com · Sales: sales@trywireline.com
- Social handle (meta): @wirelineapp

### Never say

Unlimited calls · 7-day free trial · guaranteed profit · postpaid silent overages · AI Voice Employee as a separate product category · vendor names (HeyGen/LiveAvatar) on customer video surfaces · Jobber/ServiceTitan/SSO as live.

---

## Packaged artifact inventory (2026-07-20 pass)

Root: `/opt/cursor/artifacts/wireline-launch-kit-2026-07-20/` (also zipped for download).

### Media kit / logos

| File | Use |
| --- | --- |
| `media-kit/wireline-icon.svg` | App icon / favicon source |
| `media-kit/wireline-wordmark.svg` / `-white.svg` | Horizontal wordmark |
| `media-kit/wireline-lockup.svg` / `-white.svg` | Lockup |
| `media-kit/wireline-chatgpt-app-icon.svg` | ChatGPT listing |
| `media-kit/og-image.svg` | Social OG |
| `media-kit/wireline-brand-system-board.png` | Brand board for partners |
| `media-kit/screenshots/home-desktop-1440x900.png` | Product truth |
| `media-kit/screenshots/pricing-desktop-1440x900.png` | Pricing truth |
| `media-kit/screenshots/home-mobile-390x844.png` | Mobile truth |

### Social

| File | Format | Angle |
| --- | --- | --- |
| `social/wireline-social-hero-square.png` | 1:1 | Brand hero |
| `social/wireline-social-one-employee.png` | 1:1 | One employee / every conversation |
| `social/wireline-reel-cover-wire-work-win.png` | 9:16 | Wire → Work → Win cover |
| `social/wireline-reel-front-desk.png` | 9:16 | Front desk never sleeps |

### Ads

| File | Format | Offer |
| --- | --- | --- |
| `ads/wireline-ad-build-free-launch-9.png` | 16:9 | Build free / Launch $9 |
| `ads/wireline-ad-no-surprise-overages.png` | 1:1 | Prepaid trust |

### Diagrams

| File | Story |
| --- | --- |
| `diagrams/wireline-diagram-create-train-wire-run.png` | Product loop |
| `diagrams/wireline-diagram-vendor-runtime.png` | Production call path |

### Video

| File | Notes |
| --- | --- |
| `videos/wireline-product-walkthrough.mp4` | ~22s public walkthrough |
| `videos/wireline-product-walkthrough.webm` | Source capture |
| `videos/WALKTHROUGH_SHOTLIST.md` | Shot list |
| `videos/frames/*.png` | Key frames |

### Copy packs

| File | Contents |
| --- | --- |
| `copy/social-calendar-30-days.md` | 30-day post calendar |
| `copy/ad-campaign-pack.md` | Ad sets, hooks, landing URLs |
| `copy/press-one-pager.md` | Press / partner one-pager |
| `copy/reel-scripts.md` | 15–30s reel scripts |

---

## How to regenerate

1. Logos: copy from `public/wireline-*.svg`, `public/og-image.svg`.
2. Screenshots/video: Playwright against `https://trywireline.com` (public routes; see shotlist).
3. Optional authenticated kit: `node scripts/marketing-kit.mjs` with demo creds — **fix any “free trial” copy** before publishing (contracts forbid trial language).
4. New stills: keep Letterpress palette; Inter Tight headlines; electric violet CTA only.

---

## Placement guide

| Channel | Assets |
| --- | --- |
| LinkedIn | Hero square, one-employee, Create→Train→Wire→Run diagram, walkthrough MP4 |
| X / Twitter | Build free $9 ad, short clips from walkthrough |
| Instagram / TikTok | Reel covers + front-desk reel + scripts |
| Meta / LinkedIn ads | Build free $9 16:9 + no-surprise-overages |
| Press / partners | Brand board + press one-pager + logos SVG |
| Website | Existing Letterpress pages; OG from `og-image` |

---

## Quality bar

- Every asset must name **Wireline** or **trywireline.com** visibly (except raw logo files).
- No fake dashboards, fake logos, or invented certifications.
- Prefer real product screenshots over illustrated UI when proving features.
- Prefer illustrated diagrams for architecture (vendor names OK in *internal/partner* diagrams only; customer ads stay Wireline-branded).
