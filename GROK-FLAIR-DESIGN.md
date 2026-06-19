# Lavender Noir — Wireline Design Language

**Three colors. No compromise.**

Canonical implementation: `src/index.css` + `DESIGN.md`.

## The Palette

| Token         | Hex       | Role                                    |
|---------------|-----------|------------------------------------------|
| `--lavender`  | `#F3EFFA` | Canvas — marketing & auth form side      |
| `--violet`    | `#7C3AED` | Electricity — actions, accents, focus    |
| `--charcoal`  | `#1E1B2E` | Depth — ink console, grounding           |

Everything else is a tint or shade of these three. No fourth color.

## Derived Tokens

| Token              | Value                          | Use                          |
|--------------------|--------------------------------|-------------------------------|
| `--lavender-deep`  | `#E8E0F5`                      | Borders, hover states         |
| `--lavender-warm`  | `#EDE7F6`                      | Secondary surfaces, inputs    |
| `--lavender-bright`| `#FAF8FF`                      | Elevated cards, popovers      |
| `--violet-soft`    | `#A78BFA`                      | Muted accents, badges         |
| `--violet-deep`    | `#5B21B6`                      | Pressed states, emphasis      |
| `--charcoal-soft`  | `#3D3654`                      | Secondary text (light mode)   |
| `--charcoal-muted` | `#6E6584`                      | Tertiary text, placeholders   |

## Console surface (authenticated app)

Marketing stays light. **Business / personal / studio** workspaces mount `.wl-console-surface` so tokens remap to charcoal canvas + paper text. Use `.wl-glass-panel` for sidebars and `.wl-glass-card` for panels.

## Philosophy

- **Light-sovereign marketing**: Lavender is the public canvas.
- **Ink consoles**: Authenticated tools use charcoal depth (matches auth left rail).
- **Spacious**: Generous whitespace in Studio and Assistant.
- **Three-color discipline**: lavender, violet, charcoal (+ destructive red only).

## Anti-Patterns

- Never introduce a fourth hue for decoration.
- Never use `text-white/*` navigation on `bg-background` (lavender) — use `.wl-console-surface` or charcoal text tokens.
- Never reference utility classes that are not defined in `index.css`.
