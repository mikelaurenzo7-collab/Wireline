# Lavender Noir — Wireline Design Language

**Three colors. No compromise.**

## The Palette

| Token         | Hex       | Role                                    |
|---------------|-----------|------------------------------------------|
| `--lavender`  | `#F3EFFA` | Canvas — the air everything breathes in  |
| `--violet`    | `#7C3AED` | Electricity — actions, accents, focus    |
| `--charcoal`  | `#1E1B2E` | Depth — text, weight, grounding          |

Everything else is a tint or shade of these three. No fourth color.

## Derived Tokens

| Token              | Value                          | Use                          |
|--------------------|--------------------------------|-------------------------------|
| `--lavender-deep`  | `#E8E0F5`                      | Borders, hover states         |
| `--lavender-warm`  | `#EDE7F6`                      | Secondary surfaces, inputs    |
| `--lavender-bright`| `#FAF8FF`                      | Elevated cards, popovers      |
| `--violet-soft`    | `#A78BFA`                      | Muted accents, badges         |
| `--violet-deep`    | `#5B21B6`                      | Pressed states, emphasis      |
| `--charcoal-soft`  | `#3D3654`                      | Secondary text                |
| `--charcoal-muted` | `#6E6584`                      | Tertiary text, placeholders   |

## Philosophy

- **Light-sovereign**: Lavender is the canvas, always. Dark mode exists
  only for specific dark overlay contexts.
- **Spacious**: Generous whitespace, room to breathe, especially in
  tooling surfaces like Agent Studio.
- **Three-color discipline**: Every visual decision maps to lavender,
  violet, or charcoal. Success/error states use violet intensity or
  red (`#DC2626`) respectively — never a random green or orange.
- **Confident**: The palette is unusual for B2B SaaS. That's the point.

## Anti-Patterns

- Never introduce a fourth hue (no emerald, no teal, no amber accents)
- Never use dark backgrounds as the primary canvas
- Never hardcode hex values — use CSS variables from `src/index.css`
- Never sacrifice readability for aesthetic (charcoal on lavender = 7:1+ contrast)
