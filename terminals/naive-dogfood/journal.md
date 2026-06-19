# Naive dogfood journal

## 2026-06-19 — Pass 4 (surgical VQA + console cohesion)

| Time | Route | Result | Notes |
|------|-------|--------|-------|
| — | `/app/business` | PASS | Title `Assistant — Business · Wireline`; unified sidebar shell |
| — | `/app/business/fleet` | PASS | Tight `PageHeader`; agent cards readable on charcoal |
| — | `/app/personal` | PASS | Same shell; title `Home — Personal · Wireline` |
| — | Workspace switcher | ROUGH→FIX | `<details>` overlapped nav; replaced with button menu |
| — | Body canvas bleed | ROUGH→FIX | `html.wl-console-active` class on mount |
| — | Assistant probe | CONFUSE | Stub `simulateAssistantReply` — not live Claude |

Shipped: `ConsoleShell`, `PageHeader`, `WorkspaceSwitcher`, copy tightening, PageMeta per route.
