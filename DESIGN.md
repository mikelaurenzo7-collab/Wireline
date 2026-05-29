# Wireline Design System — Aurora Cream

**Status:** Internal reference (2026)
**Goal:** One cohesive, premium, editorial visual language across every client-facing surface.

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
- `.glass` — the signature translucent cream surface (use everywhere for cards)
- `.aurora-ring` — subtle premium border glow (use on active/selected states)
- Soft brand halos: `<span aria-hidden className="absolute inset-0 -z-10 rounded-full bg-brand/30 blur-2xl scale-150" />`

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
- Use `glass` for all cards and surfaces.
- Mark purely decorative elements with `aria-hidden`.

**Don't**
- Introduce new colors or radius values.
- Mix flat `bg-brand` buttons with gradient ones.
- Create one-off empty states.
- Use `border-white/*` on cream backgrounds (use `border-black/8` or `border-ink/[0.08]`).
- Stack multiple cards inside cards without clear visual separation.

---

## 4. File Locations

- Reusable primitives → `src/components/ui/`
  - `Medallion.tsx`
  - `SectionHeader.tsx`
  - `EmptyState.tsx`
  - `Button.tsx`
- Page-specific components stay in their feature folders but should compose the `ui/` primitives.

---

*When in doubt, look at the Director welcome state or the elevated AgentWorkspace empty state — they are the current gold standard.*