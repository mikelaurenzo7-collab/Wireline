# Wireline Design System (Grok Certified v1)

**Single source of truth** for the robofuturistic aesthetic across Web, iOS, and Android.

## Core Principles
- Sharp-corner brutalism (4-8px radius max)
- Dark base: #0a0a0f
- Electric accents: Cyan (#00F5FF) + Magenta (#FF00AA)
- High contrast, reduced motion respect
- Holographic/glassmorphism + subtle scanlines on cards
- "Blade Runner 2049 meets Linear" vibe

## Color Tokens
| Token | Web (Tailwind) | iOS (SwiftUI) | Android (Compose) | Hex |
|-------|----------------|---------------|-------------------|-----|
| DarkBase | `bg-[#0a0a0f]` | `Color(0xFF0A0A0F)` | `Color(0xFF0A0A0F)` | #0a0a0f |
| Cyan | `text-[#00F5FF]` | `Color(0xFF00F5FF)` | `Color(0xFF00F5FF)` | #00F5FF |
| Magenta | `text-[#FF00AA]` | `Color(0xFFFF00AA)` | `Color(0xFFFF00AA)` | #FF00AA |
| Glass | `bg-white/5` + blur | `.ultraThinMaterial` + opacity | `Color(0x1AFFFFFF)` | - |

## Corner Radius
- Small: 4dp / 4pt (sharp)
- Medium: 8dp / 8pt
- Large: 12dp (use sparingly)

## Typography
- Headings: Inter / SF Pro / Roboto Medium, tight tracking
- Body: Inter / SF Pro / Roboto Regular
- Mono: JetBrains Mono for metrics

## Motion
- Always respect `reducedMotion`
- Subtle scale + opacity for interactions
- No large bouncy animations

## Component Guidelines
- Cards: Glassmorphism + subtle border + scanline overlay (optional)
- Buttons: Sharp corners, high contrast, cyan/magenta accents
- Status pills: Small, sharp, color-coded (green=idle, cyan=on call, magenta=training)

## Platform Implementation
### Web (Tailwind + CSS)
Use CSS variables or Tailwind config with the tokens above.

### iOS (SwiftUI)
```swift
let darkBase = Color(hex: "#0a0a0f")
let cyan = Color(hex: "#00F5FF")
// Use .cornerRadius(4) for sharp brutalist feel
// Respect UIAccessibility.isReduceMotionEnabled
```

### Android (Jetpack Compose)
See `WirelineTheme.kt` and `WirelineTokens`.

**This spec is the law.** All new UI must follow it.