# Wireline Design System — Aurora Cream

**Status:** Internal reference (2026)
**Goal:** One cohesive, premium, editorial visual language across every client-facing surface.

> **Canonical UI layer:** [`src/components/ui/shadcn/*`](src/components/ui/shadcn/).
> Every button, input, modal, sheet, tab, dropdown, switch, tooltip,
> badge, alert, progress, skeleton, avatar, accordion, separator, and
> command palette ships from there. The Aurora Cream primitives
> (`Medallion`, `SectionHeader`, `EmptyState`, `Button` alias) compose
> shadcn primitives; they never reimplement them. Dark mode flips via
> `ThemeContext` toggling the `.dark` class on `<html>`.

---

## 1. Core Tokens (Never invent new ones)

### Typography
- **Display (Headlines):** `font-display` → Fraunces (italic, 400–700)
- **Interface (Body/UI):** `font-sans` → Plus Jakarta Sans
- **Mono (Labels, Code, Metrics):** `font-mono` → JetBrains Mono

### Color
- `--color-brand`: #4F1E7B (Silky Purple)
- `--color-brand-deep`: #3B154C
- `--color-ink`: #1A1614
- `--color-paper`: #EFE9DC (warm cream base)
- `--color-muted` / `--color-muted-soft`
- Gradients: Always `from-brand to-brand-deep` for primary actions and medallions.

### Effects
- `.glass` — the signature translucent cream surface. **Permitted surfaces:** modal overlays (`.glass-elevated`), sticky shells (`.shell-sticky-glass`), sidebar chrome, icon buttons on glass panels. **Do not** use for ordinary card bodies — use `<Card>` instead (see migration note below).
- `.aurora-ring` — subtle premium border glow (use on active/selected states)
- Soft brand halos: `<span aria-hidden className="absolute inset-0 -z-10 rounded-full bg-brand/30 blur-2xl scale-150" />`

> **Migration note — `glassUtility` ratchet:** The `shadcn-pivot-ratchet` tracks `.glass` usage and only allows it to decrease over time. Card bodies that currently carry `.glass` should be migrated to `<Card>` from `src/components/ui/shadcn/`. `<Card>` consumes the `--card` design token, adapts to dark-mode automatically, and is the canonical card surface going forward. Shell surfaces (TopBar, Sidebar, modals, popovers, sticky headers) are permanently exempt — those keep `.glass`/`.glass-strong`/`.glass-elevated`/`.shell-sticky-glass`.

### Radius
- **Zero radius** is the default (`--radius: 0`). Rounded corners are used only for medallions and pills.

---

## 2. Recurring Patterns (Use these components)

### SectionHeader
```tsx
<SectionHeader
  eyebrow="Live right now"
  title="Talk to the Wireline team"
  description="No signup required."
/>
```
- Always starts with a mono eyebrow.
- Title is always `font-display italic`.
- Description is `text-muted`.

### Medallion + Halo
```tsx
<Medallion withHalo size="md">
  <Sparkles className="w-6 h-6" />
</Medallion>
```
- The signature visual motif for empty states, identity, and status.

### EmptyState (Canonical)
```tsx
<EmptyState
  icon={Users}
  title="No entries yet"
  description="Upload a PDF or add a policy so your agent answers consistently."
  actions={[{ label: "Upload CSV", onClick: ..., primary: true }]}
/>
```
- Use this everywhere instead of ad-hoc empty states.

### Primary Button
```tsx
<Button variant="primary">
  Start free trial <ArrowRight className="w-4 h-4" />
</Button>
```
- Always gradient + depth shadow + active press.

### Status / Live Dot
```tsx
<span className="relative flex h-1.5 w-1.5">
  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500/60" />
  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
</span>
```

---

## 3. Do's and Don'ts

**Do**
- Start every major content block with `SectionHeader`.
- Use `Medallion` + halo for every empty / idle / no-data state.
- Keep CTAs consistent (`primary` gradient or `secondary` glass).
- Use `<Card>` for all card surfaces; reserve `.glass` for non-card surfaces (modals, sticky shells, popovers, icon-button faces) where the shadcn Card token is inappropriate.
- Mark purely decorative elements with `aria-hidden`.
- **Decouple visual size from hit targets.** Keep visual elements compact (36px inputs, 32px secondary buttons, 20px utility icons). Expand interactive hit areas to 44–48px minimum using invisible `::after` pseudo-elements, transparent outer padding, or container bounds — never by inflating the visual container.
- Use sharp 14px body typography, high-contrast dark surfaces, and thin ambient-luminosity borders for information density.
- Use `.wl-panel` and `.wl-panel-elevated` for high-fidelity specular depth surfaces. Do not flatten surfaces with `border border-black/8` patterns. `wl-panel-elevated` now utilizes heavy gradient + blur depth logic representing true luxury UI design.
- Apply `.touch-press` to all small interactive elements (buttons, pills) for zero-latency GPU-driven feedback.
- Use `.wl-orbit` with `data-active` for orbital activity indicators around agent avatars.
- Use `.scroll-viewport` on any container that needs isolated inner scrolling (overscroll containment).
- Apply `.wl-label` for premium uppercase captions (10px, tracking +0.03em).

**Don't**
- Introduce new colors or radius values.
- Mix flat `bg-brand` buttons with gradient ones.
- Create one-off empty states.
- Use `border-white/*` on cream backgrounds (use `border-black/8` or `border-ink/[0.08]`).
- Stack multiple cards inside cards without clear visual separation.
- Use bulky `w-11 h-11` / `w-12 h-12` classes to satisfy tap targets — this distorts the compact visual silhouette. Use `hit-area-44` or the built-in `::after` expansion on ShadButton instead.
- Use heavy flat `border border-black/8` for workspace panels — migrate to `.wl-panel` / `.wl-panel-elevated` specular depth system.

---

## 3b. Mobile-First Architecture — Locked Viewport

The app shell uses a **strict locked viewport** pattern:

- `html`, `body`, `#root` are pinned to `height: 100dvh; overflow: hidden`
- No document-level scroll — the browser chrome stays perfectly stationary
- All scrollable areas use `.scroll-viewport` (`overflow-y: auto; overscroll-behavior-y: contain`)
- This eliminates scroll chaining, rubber-band bounce, and address-bar jank

### Wireline Identity Classes

| Class | Purpose |
|-------|---------|
| `.wl-panel` | Specular depth surface (ambient blur + inset highlight) |
| `.wl-panel-elevated` | Primary workspace container (deeper blur + aurora glow + specular highlights + precise shadow depths) |
| `.card-interactive` | Standard interactive card tile (translates up, border hover state, active bounce) |
| `.touch-press` | Zero-latency GPU-driven scale(0.97) on :active |
| `.touch-press-deep` | Deeper press for larger surfaces (scale 0.95 + opacity) |
| `.wl-orbit` | Orbital activity ring around agent avatars |
| `.wl-label` | Premium uppercase caption (10px, +0.03em tracking) |
| `.scroll-viewport` | Isolated scroll container with overscroll containment |

### Bottom Sheet Pattern (Mobile)

On mobile (<xl), panels slide up from the bottom as full-width sheets instead of side drawers. They include:
- A drag handle (36px × 4px rounded indicator)
- Spring physics animation (damping: 32, stiffness: 340)
- Max height of 85dvh to maintain context
- `.wl-panel-elevated` specular treatment

---

## 4. File Locations

The UI layer is **tiered**. Always reach for the lowest tier that fits.

### Tier 1 — shadcn primitives (`src/components/ui/shadcn/`) — **canonical**

These wrap Radix primitives and consume the design tokens defined in
`src/index.css` (`--background`, `--card`, `--primary`, `--ring`, …).
They are the only sanctioned source of buttons, inputs, tabs, modals,
sheets, popovers, switches, tooltips, etc. Importing from anywhere else
when an equivalent shadcn primitive exists is a regression.

Available primitives (import from `@/src/components/ui/shadcn` or its
barrel `index.ts`):

- `ShadButton` (+ `buttonVariants`) — the canonical button. Variants:
  `default` (gradient brand), `outline` (cream glass border), `ghost`,
  `secondary`, `destructive`, `link`,
  `glass` (frosted-glass icon/action button — use on glass card surfaces),
  `chrome` (dark-surface icon/action button — use inside TopBar/Sidebar only).
  Sizes: `default | sm | lg | icon`.
- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`
- `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`
- `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`
- `Sheet`, `SheetTrigger`, `SheetContent`, `SheetHeader`, …
- `DropdownMenu`, `DropdownMenuTrigger`, …
- `Select`, `SelectTrigger`, `SelectContent`, `SelectItem`, `SelectValue`
- `Checkbox` — styled native `<input type="checkbox">`; use anywhere you'd
  reach for a tri-state-free boolean toggle that should look like a box,
  not a `Switch` pill.
- `Slider` — styled native `<input type="range">`; use anywhere you'd
  reach for a numeric slider with a single thumb.
- `Command`, `CommandInput`, `CommandList`, `CommandItem`, …
- `Input`, `Switch`, `Badge`, `Alert`, `Progress`, `Skeleton`, `Avatar`,
  `Separator`, `Tooltip`, `ScrollArea`, `Accordion`

Never render a raw `<button>` / `<input>` / `<dialog>` / `<select>` in
`src/components/**` or `src/pages/**`. The DOM-anti-pattern ratchet
(`src/components/ui/__tests__/shadcn-pivot-ratchet.test.ts`) fails CI
if these counts grow.

### Tier 2 — Aurora Cream compositions (`src/components/ui/`)

Higher-level patterns composed **out of** the shadcn primitives:

- `Medallion.tsx` — signature halo motif for empty/idle states.
- `SectionHeader.tsx` — mono eyebrow + italic display title + muted
  description, used at the top of every major content block.
- `EmptyState.tsx` — canonical "no data yet" surface; wraps `Medallion`
  + `ShadButton`.
- `HaloButton.tsx` — thin `<ShadButton asChild>` wrapper for branded/halo
  CTAs that have hand-tuned glass + blur-2xl halos. Preserves the visual
  pixel-perfectly while satisfying the raw-`<button>` ratchet.

Feature components live in their own folders (`src/components/<feature>/…`)
and must compose out of Tier 1 / Tier 2 — they never reintroduce raw
HTML controls.

### Tier 3 — theme + branding

- `src/contexts/ThemeContext.tsx` — light / dark / system preference.
  Toggles the `.dark` class on `<html>`; the shadcn token system in
  `src/index.css` flips automatically.
- `src/contexts/BrandingContext.tsx` — per-tenant logo + accent.

---

*When in doubt, look at the Director welcome state or the elevated AgentWorkspace empty state — they are the current gold standard.*