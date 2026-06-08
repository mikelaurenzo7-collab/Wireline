# CSP Hardening Loop — Final State



> Agent memory across loop ticks. Updated 2026-06-08.



## Combined plan (Phases 0–6 + code reviews)



| Step | Item | Status |

|------|------|--------|

| 0 | Inventory ratchet + vercel sync + CI `csp:check` | **DONE** |

| 1 | Static safe-area / display migrations | **DONE** |

| 2 | `--wl-accent` utilities in index.css | **DONE** |

| 3 | Motion primitives → CSS keyframes | **DONE** |

| 4 | PreviewCards → preview-cards.css | **DONE** |

| 5a | Eliminate `style={` in `.tsx` (real migration, not asStyle shim) | **DONE** |

| 5b | Move `<style>` JSX blocks → index.css (VoidButton, Prism, Glyph, SignalThread, Stickers) | **DONE** |

| 5c | Pricing spotlight → `.wl-pricing-tier--highlight` | **DONE** |

| 6a | Inventory: comment-strip + `<style` ratchet (`src/lib/csp-inventory.ts`) | **DONE** |

| 6b | CSP split: `style-src-elem 'self'` + `style-src-attr 'unsafe-inline'` | **DONE** |

| 6c | App shell skeleton → `public/app-shell.css` (no inline `<style>`) | **DONE** |

| 6d | SectionStickers calc gutters → `applyEdgeInset` (DOM API, not broken attr) | **DONE** |

| 6e | Remove `css-style.ts` / codemod scripts | **DONE** |

| 7 | `npm run verify` + visual QA | **PENDING** |



## Metrics



| Ratchet | Count |

|---------|-------|

| `style={` in `.tsx` (comments stripped) | **0** |

| `<style` in `.tsx` | **0** |

| `asStyle()` usages | **0** (module deleted) |



## Prod CSP (buildCSP false)



- `style-src-elem 'self'` — blocks injected `<style>` tags; shell CSS is `/app-shell.css`

- `style-src-attr 'unsafe-inline'` — Framer Motion / Recharts / imperative sticker gutters

- No blanket `style-src 'unsafe-inline'`



## Key artifacts



- `src/lib/csp-inventory.ts` + `scripts/csp-inventory-run.ts`

- `src/lib/apply-dom-layout.ts` — calc-safe positioning without `style={` in JSX

- `public/app-shell.css` — first-paint skeleton

- `scripts/check-csp-drift.mjs` — vercel.json sync

- `.cursor/skills/wireline-design/` — `csp-theming.md` + updated SKILL / wireline-system / surfaces



## Branch



`feat/csp-phase6-runtime-styles` → merge to `main` after verify

