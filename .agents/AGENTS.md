# Wireline Custom Agent Rules

## 1. 5-Tier Billing Contract Integrity
- **Canonical Tiers**: The five active subscription tiers are strictly `["personal", "personal-plus", "business-starter", "starter", "scale"]`.
- **Legacy Normalization**: Legacy keys (`pro`, `lite`, `business`, `enterprise`) must only be used in legacy normalization functions (such as `planById` mapping `pro -> starter` or `enterprise -> scale`). They must never be listed in `STRIPE_PLANS` or expected in active endpoint responses.
- **Stripe Price Environment Variables**: Ensure that price ID environment setups align explicitly with modern definitions (e.g., `business-starter` utilizes `STRIPE_BUSINESS_STARTER_PRICE_ID` and `STRIPE_BUSINESS_STARTER_EXTRA_AGENT_PRICE_ID`).
- **Tests & Mock Alignment**: All billing, entitlements, model policy, and webhook test suites must reflect these exact tiers, prices, and environment variable keys to prevent integration regressions.

## 2. NPX Command Execution
- **Execution Policy Fix**: When running `npx` commands (like `npx vercel`), always prefix the command with `cmd.exe /c` (e.g., `cmd.exe /c npx vercel env pull`). This bypasses the PowerShell execution policy restriction that blocks `npx.ps1`.

## 3. Windows Vitest Testing Stability
- **Avoid Dynamic Imports in Helpers**: Avoid dynamic `await import(...)` inside frequently-called test setup functions (e.g. `buildApp()` in routes tests). Statically import test modules at the top of the file to bypass Windows-specific file-locking overheads and prevent Vitest thread hangs or 5000ms timeouts.

## 4. Kotlin Jetpack Compose Extensions
- **No Qualified Extension Chaining**: Never use fully qualified package-prefix paths for chained Modifier extensions (e.g. avoid `Modifier.androidx.compose.ui.draw.blur`).
- **Static Import Enforcement**: Always statically import Compose extensions (e.g. `import androidx.compose.ui.draw.scale`, `import androidx.compose.ui.draw.blur`, `import androidx.compose.foundation.background`) and call them cleanly on the Modifier instance (e.g. `Modifier.scale(1.05f).blur(24.dp)`).

## 5. Node.js Script Path Resolution on Windows
- **Avoid raw URL.pathname parsing**: Never use `path.resolve(new URL('..', import.meta.url).pathname)` in Node.js utility or automation scripts. On Windows, `.pathname` on a file URL retains a leading slash (e.g. `/C:/Users/...`), which `path.resolve` incorrectly resolves as relative or prepends with the active drive letter (e.g., `C:\C:\Users\...`).
- **Always use fileURLToPath**: To securely determine relative paths from an ES Module context, always import `fileURLToPath` from `node:url` and resolve paths via `fileURLToPath(new URL('relative-path', import.meta.url))`. This guarantees stable, zero-ENOENT cross-platform execution on both Unix and Windows systems.

## 6. Premium Workspace Layouts & Reset Bypass
- **The `.app-surface` Context Requirement**: The codebase contains a global CSS reset (`* { border-radius: 0 !important; }` in `app-shell.css`) intended to enforce flat borders on public marketing structures. This reset is bypassed inside elements with the `.app-surface` class.
- **Enforcing Rounded Borders & Curves**: To ensure workspaces (such as personal/business dashboard shells) render with modern, premium rounded curves (e.g., 6px radius) and fluid gutters, the root layout shell container (usually the outermost `div` in workspace components) **must** include the `.app-surface` class. Always verify that new dashboard layouts or workspaces are wrapped in an `.app-surface` container.


