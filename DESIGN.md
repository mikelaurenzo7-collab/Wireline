# Wireline Design System — Aurora Cream 2.0

**Status:** World-Class Reference (2026)  
**Philosophy:** The most sophisticated, Editorial Luxury + Old Money Tech aesthetic in existence. Every pixel is intentional. Every interaction is premium. Every surface is a masterpiece.

> **Canonical UI layer:** [`src/components/ui/shadcn/*`](src/components/ui/shadcn/).  
> Every button, input, modal, sheet, tab, dropdown, switch, tooltip, badge, alert, progress, skeleton, avatar, accordion, separator, and command palette ships from here. The Aurora Cream primitives (`Medallion`, `SectionHeader`, `EmptyState`, `Button` alias) compose shadcn primitives — they never reimplement them. Dark mode flips via `ThemeContext` toggling the `.dark` class on `<html>`.

---

## 1. Core Tokens (The Holy Trinity — Never Deviate)

### Typography — A Study in Editorial Contrast
- **Display (Headlines):** `font-display` → Fraunces (italic, 400–700)  
  *The soul of the system. Editorial, sophisticated, unforgettable.*
- **Interface (Body/UI):** `font-sans` → Plus Jakarta Sans  
  *Clean, modern, highly legible at all sizes.*
- **Mono (Labels, Code, Metrics):** `font-mono` → JetBrains Mono  
  *Technical precision. Tabular numerals for data. Code snippets.*

### Color — Warm Luxury Meets Digital Precision
- `--color-brand`: #8B3FD6 (Editorial Violet — the signature)
- `--color-brand-deep`: #3B154C (Deep皇室 Purple)
- `--color-ink`: #1A1614 (Warm Dark Ink — never pure black)
- `--color-paper`: #EFE9DC (Warm Cream — the canvas of elegance)
- `--color-muted` / `--color-muted-soft` (Context-aware via CSS vars)

### The Gradient Philosophy
Always `from-brand to-brand-deep` for:
- Primary actions (buttons, CTAs)
- Medallions (empty states, status)
- Active states and selections

### Effects — The Secret Sauce
- `.glass` — Translucent cream surface with proprietary blur.  
  **Permitted surfaces only:** modal overlays (`.glass-elevated`), sticky shells (`.shell-sticky-glass`), sidebar chrome, icon buttons on glass panels.
- `.aurora-ring` — Subtle premium border glow for active/selected states.
- Soft brand halos: `<span aria-hidden className="absolute inset-0 rounded-full bg-brand/30 blur-2xl scale-150" />`
- `.brutal-card` — The ultimate card surface. Glassmorphic with warm cream gradients.
- `.card-interactive` — Hover lift with brand-tinted shadow bloom.

### Radius — The Sharp Edge Philosophy
- **Zero radius** is the default (`--radius: 0`).  
- Rounded corners are used **exclusively** for medallions, pills, badges, and circular indicators.
- This creates the "Old Money Tech" editorial aesthetic — sharp, precise, confident.

### Spacing — Generous Negative Space
- Marketing surfaces: `py-24 lg:py-32` (generous vertical rhythm)
- Content surfaces: `p-6 md:p-8` (breathing room)
- Tight spaces: `gap-4` minimum (never cram elements)
- The cream background IS the design element — let it breathe.

---

## 2. The World-Class Component Hierarchy

### Tier 1 — shadcn Primitives (`src/components/ui/shadcn/`) — **Canonical & Supreme**

These wrap Radix primitives and consume the design tokens defined in `src/index.css`. They are the ONLY sanctioned source of UI controls.

#### `ShadButton` (+ `buttonVariants`) — The Button System
```tsx
// Primary — Gradient + Depth Shadow + Active Press
<ShadButton variant="default">
  Start free trial <ArrowRight className="w-4 h-4" />
</ShadButton>

// Glass — Frosted glass for glass surfaces
<ShadButton variant="glass">
  <Icon /> Action
</ShadButton>

// Chrome — Dark surface for TopBar/Sidebar
<ShadButton variant="chrome">
  <Icon /> Action
</ShadButton>
```
**Variants:** `default` (gradient brand), `outline` (cream glass border), `ghost`, `secondary`, `destructive`, `link`, `glass` (frosted-glass), `chrome` (dark-surface).  
**Sizes:** `default | sm | lg | icon`.

#### `Card` — The Ultimate Card Surface
```tsx
// Static card with brutal-card styling
<Card>
  <CardHeader>
    <CardTitle>Editorial Elegance</CardTitle>
    <CardDescription>Sophisticated content lives here</CardDescription>
  </CardHeader>
  <CardContent>{/* Your content */}</CardContent>
</Card>

// Interactive card with hover lift
<Card interactive>
  {/* Floats up 2px on hover with brand shadow */}
</Card>
```

#### Other Primitives Available
- `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` — with `app-tab-active-bg` for active states
- `Dialog`, `DialogContent` — uses `glass-elevated` for premium modals
- `Sheet`, `SheetContent` — slide-in panels with glass morphism
- `DropdownMenu` — frosted dropdown with smooth transitions
- `Select` — uses `app-input-soft` styling
- `Input` — uses `app-input-soft` class (NEVER raw bg-white)
- `Checkbox`, `Switch`, `Slider` — all styled with brand colors
- `Command` — command palette with glass elevation
- `Badge`, `Alert`, `Progress`, `Skeleton`, `Avatar`, `Separator`, `Tooltip`, `ScrollArea`, `Accordion`

**DOM Anti-Pattern Ratchet:** Never render raw `<button>`, `<input>`, `<dialog>`, or `<select>` in `src/components/**` or `src/pages/**`. The ratchet test fails CI if these counts grow.

### Tier 2 — Aurora Cream Compositions (`src/components/ui/`) — **High-Level Patterns**

#### `Medallion` — The Signature Visual Motif
```tsx
// Empty state medallion with crystalline glint
<Medallion size="md" withHalo>
  <Sparkles className="w-6 h-6" />
</Medallion>

// Small inline medallion
<Medallion size="sm" shimmer>
  <Icon className="w-4 h-4" />
</Medallion>
```
Features:
- Crystalline glint animation (4.6s cubic-bezier)
- Optional halo (blur-2xl glow)
- Optional shimmer effect
- Four sizes: xs, sm, md, lg

#### `SectionHeader` — Every Major Content Block Starts Here
```tsx
<SectionHeader
  eyebrow="Live right now"
  title="Talk to the Wireline team"
  description="No signup required."
/>
```
- Always starts with mono eyebrow (`text-eyebrow`)
- Title is always `font-display italic`
- Description is `text-muted`
- Never create custom section headers — use this.

#### `EmptyState` — The Canonical "No Data" Surface
```tsx
<EmptyState
  icon={Users}
  title="No entries yet"
  description="Upload a PDF or add a policy so your agent answers consistently."
  actions={[{ label: "Upload CSV", onClick: ..., primary: true }]}
  framed={false} // true for glass-strong chrome
/>
```
- Wraps `Medallion` + `ShadButton`
- Optional `framed` mode for premium surfaces
- Optional `eyebrow` text

#### `SpinnerGem` — The Premium Loading Indicator
```tsx
// Inline loading (replaces Loader2)
<SpinnerGem size="xs" />

// Larger loading state
<SpinnerGem size="md" />
```
Replaces generic `Loader2 animate-spin` with branded medallion shimmer.

### Tier 3 — Theme + Branding

- `src/contexts/ThemeContext.tsx` — light / dark / system preference
- `src/contexts/BrandingContext.tsx` — per-tenant logo + accent

---

## 3. The Animation System — Premium, Subtle, Intentional

### Motion/React Configuration
All motion components MUST check `useReducedMotion()` via our `useAnimationConfig` hook:

```tsx
import { useAnimationConfig } from "@/src/hooks/useAnimationConfig";

function MyComponent() {
  const { motionProps, pageTransition } = useAnimationConfig();
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={pageTransition}
      {...motionProps}
    >
      Content
    </motion.div>
  );
}
```

### Premium Transition Timing
- **Page transitions:** `duration: 0.35, ease: [0.22, 1, 0.36, 1]` (editorial ease)
- **Micro-interactions:** `duration: 200ms, ease: cubic-bezier(0.22, 1, 0.36, 1)`
- **Button press:** `scale(0.96)` with `duration: 100ms`
- **Card hover:** `translateY(-2px)` with brand shadow bloom

### Key Animations (All in index.css)
- `medallion-glint` — Crystalline gemstone sweep (4.6s)
- `skeleton-shimmer` — Premium loading sweep (1.8s)
- `card-interactive` — Hover lift with shadow (0.25s)
- `aurora-drift` — Slow background bloom (18s, respect reduced-motion)
- `live-pulse` — Status dot pulse (1.8s)

### Reduced Motion Support
- CSS animations: `@media (prefers-reduced-motion: reduce)` blocks ALL CSS animations
- Motion/react: Components MUST use `useAnimationConfig()` hook
- Never animate for users who prefer reduced motion

---

## 4. Do's and Don'ts — The Law

### DO — Follow These Religiously
1. **Start every major content block with `SectionHeader`** — no exceptions
2. **Use `Medallion` + halo for every empty/idle/no-data state** — it's the signature
3. **Keep CTAs consistent** — `default` gradient or `glass` for secondary
4. **Use `<Card>` for ALL card surfaces** — reserve `.glass` for shells only
5. **Mark decorative elements with `aria-hidden`** — accessibility is luxury
6. **Use `SpinnerGem` instead of `Loader2`** — premium loading everywhere
7. **Check `useReducedMotion()` in all motion components** — inclusive luxury
8. **Use `app-input-soft` for all inputs** — never raw `bg-white`
9. **Use `marketing-btn-primary` for marketing CTAs** — consistent conversion
10. **One primary CTA per section maximum** — luxury doesn't beg

### DON'T — These Are Regressions
1. **Never introduce new colors or radius values** — use the tokens
2. **Never mix flat `bg-brand` with gradient buttons** — pick one system
3. **Never create one-off empty states** — use `EmptyState`
4. **Never use `border-white/*` on cream backgrounds** — use `border-ink/[0.08]`
5. **Never stack multiple cards without clear visual separation** — use borders/gaps
6. **Never use hardcoded colors in components** — use CSS variables
7. **Never skip `useReducedMotion()` in motion components** — it's required
8. **Never use `Loader2 animate-spin`** — use `SpinnerGem`
9. **Never create raw HTML buttons/inputs** — use shadcn primitives
10. **Never forget: the cream background is an active design element** — let it breathe

---

## 5. File Locations — Know Where Everything Lives

### UI Primitives (Tier 1)
`src/components/ui/shadcn/` — All shadcn components  
`src/index.css` — All design tokens and utilities (2565+ lines of premium)

### Compositions (Tier 2)
`src/components/ui/Medallion.tsx` — Signature halo motif  
`src/components/ui/SectionHeader.tsx` — Editorial headers  
`src/components/ui/EmptyState.tsx` — Canonical empty states  
`src/components/ui/SpinnerGem.tsx` — Premium loading gem  
`src/components/ui/HaloButton.tsx` — Branded CTA wrapper

### Hooks & Utilities
`src/hooks/useAnimationConfig.ts` — Reduced motion hook  
`src/lib/utils.ts` — `cn()` utility for class merging

### Contexts (Tier 3)
`src/contexts/ThemeContext.tsx` — Light/dark/system  
`src/contexts/BrandingContext.tsx` — Per-tenant branding

---

## 6. The Gold Standard — Learn From These

When in doubt, look at these references (they are PERFECTION):

1. **Director welcome state** — Perfect `EmptyState` + `Medallion` usage
2. **Elevated AgentWorkspace empty state** — Framed premium surface
3. **CommandCenter live floor** — Sophisticated data display
4. **LandingPage hero** — Maximum visual impact with `marketing-hero-title`
5. **Pricing tier cards** — `<Card>` with premium spacing

---

## 7. The Testing Ratchet — We Never Go Backwards

### shadcn-pivot-ratchet (`src/components/ui/__tests__/shadcn-pivot-ratchet.test.ts`)
Fails CI if raw HTML element counts grow:
- Raw `<button>` elements
- Raw `<input>` elements  
- Raw `<dialog>` elements
- Raw `<select>` elements

### Design System Tests
- All interactive elements MUST have `data-testid` attributes
- All images must have meaningful `alt` text
- All animations must respect `prefers-reduced-motion`

---

*When implementing ANY UI: Ask yourself "Is this the most sophisticated, elegant, and premium version possible?" If not, iterate until it is. The details are not the details — they ARE the design.*
