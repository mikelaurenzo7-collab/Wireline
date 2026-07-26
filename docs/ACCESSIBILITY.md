# Wireline Accessibility Statement

**Commitment:** Wireline is committed to ensuring our web application is
accessible to all users, including those with disabilities. We target
**WCAG 2.1 Level AA** conformance across all public-facing and
operator-facing surfaces.

---

## Current Status

### Implemented

| Category | Implementation | Evidence |
|----------|---------------|----------|
| **Keyboard navigation** | All interactive elements reachable via Tab/Enter/Escape | CommandBar, modal dismissal, form navigation |
| **Touch targets** | Minimum 44×44px interactive target on CTAs, inputs, and buttons | `min-height: 44px` enforced in `design-system.css` / `cta-readability.css`; comfortable-target token `--wireline-interaction-target-comfortable` |
| **Color contrast** | Wireline Letterpress (Aurora) palette — near-white text on obsidian canvas in dark mode, obsidian text on near-white in light mode | `design-tokens/wireline.tokens.json` + `src/styles/design-system.css` |
| **Reduced motion** | `motion/react` respects `prefers-reduced-motion` | Framer Motion default behavior |
| **Focus indicators** | Visible focus rings on all interactive elements | Tailwind's `focus:ring-2` pattern |
| **Semantic HTML** | Proper heading hierarchy, landmark regions | Layout components use `<nav>`, `<main>`, `<header>` |
| **Form labels** | All inputs have associated labels or aria-label | AuthPortal, TeamSettings, agent config forms |
| **Error messages** | Validation errors announced to screen readers | `role="alert"` on error containers |
| **Responsive text** | Minimum 11px on mobile (global CSS scaling) | `src/index.css` media query |

### In Progress

| Item | Target | Status |
|------|--------|--------|
| Full ARIA labeling audit | All interactive components | Q3 2026 |
| Screen reader testing (NVDA + VoiceOver) | All critical flows | Q3 2026 |
| Skip-to-content link | All pages | Q3 2026 |
| Live region announcements for async updates | Call logs, live monitor | Q3 2026 |
| Automated a11y testing in CI (axe-core) | PR gate | Q4 2026 |

### Known Limitations

- **Voice call interface**: The core product (voice agents on phone calls)
  is inherently accessible to visually impaired users — it's a phone call.
  The web dashboard for managing agents requires visual interaction.
- **Real-time live monitor**: The supervisor cockpit updates in real-time.
  Screen reader users may need to manually refresh to get latest state.
- **Charts and graphs**: Recharts visualizations in InsightsView have basic
  ARIA labels but may not convey all data points to screen readers.

## Testing Methodology

1. **Manual keyboard testing**: Tab through all critical flows without a mouse
2. **Screen reader testing**: NVDA (Windows) + VoiceOver (macOS)
3. **Automated scanning**: axe-core via browser extension (manual, CI planned)
4. **Color contrast**: Verified via Tailwind's contrast-checked palette
5. **Zoom testing**: UI functional at 200% browser zoom

## Reporting Issues

If you encounter an accessibility barrier:

1. **Email:** support@trywireline.com (subject: "Accessibility")
2. **Phone:** Call (630) 642-5661 and tell Sarah about the issue
3. **In-app:** Help Center → Report Accessibility Issue

We commit to acknowledging accessibility reports within 2 business days
and providing a fix or workaround within 14 days.

## Standards Reference

- [WCAG 2.1 AA](https://www.w3.org/WAI/WCAG21/quickref/?currentsidebar=%23702&levels=aaa)
- [WAI-ARIA 1.2](https://www.w3.org/TR/wai-aria-1.2/)
- [Section 508](https://www.section508.gov/)

---

*Last reviewed: May 2026. This document is updated quarterly.*
