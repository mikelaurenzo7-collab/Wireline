# BotBound Command

BotBound Command is a privacy-minimal browser command surface for BotBound Studio.

The website remains the full operating system for setup, billing, Knowledge, Connections, Phone, Inbox, launch, and review. The extension exists for the moment when a customer is already inside a browser tab and wants BotBound to act with that page as context.

It lets a signed-in BotBound customer deliberately bring the active page, text they select, or a linked contact into the existing Studio workflow, where all Bot configuration, authorization, consent, billing, and launch controls remain server-owned.

## What it supports

- **Chrome, Microsoft Edge, and Opera:** one Chromium Manifest V3 artifact using the browser side-panel API when available.
- **Firefox:** one Manifest V3 overlay using Firefox's native sidebar action.
- **Fallback:** opening Studio in a tab if a sidebar cannot be opened by the host browser.

## Product role

- Prepare a call from the current page or a `tel:` link.
- Draft a text from page context.
- Create a follow-up from selected text.
- Send a Bot task into Studio.
- Jump to Bots, Connections, Phone, Inbox, Knowledge, or Studio.

## Privacy contract

The baseline package intentionally has:

- no `host_permissions`
- no `<all_urls>` access
- no persistent content script
- no BotBound session-token storage
- no background sync or page harvesting

The extension reads the active page only after a user action. It captures a constrained title, URL, meta description, and explicit selection; it opens Studio with that context inside the URL fragment so the browser does not send it as part of the initial HTTP request. Studio immediately removes the fragment and presents the material as reference-only text for the user to review.

## Explicit context workflows

BotBound Command should be a competitive advantage because every workflow is explicit and reviewable. The approved product workflows are:

1. **Prepare call from this page** — send the active page title/URL/selection only after the user clicks the command, then ask for call confirmation in Studio before any live call.
2. **Extract facts into Knowledge** — turn selected page context into proposed knowledge or directives that the customer can review.
3. **Draft follow-up** — use the current page or selection to draft a text/email/call recap without sending it automatically.
4. **Send to Studio** — hand the context to the selected Bot workroom for review, simulation, or next action.

Non-negotiables: no broad host permissions, no silent page harvesting, no browser token storage, and no background CRM mirror.

## Build

From the repository root:

```bash
node apps/browser-extension/scripts/build.mjs --check
node apps/browser-extension/scripts/build.mjs
```

Artifacts:

```text
apps/browser-extension/dist/chromium/
apps/browser-extension/dist/firefox/
```

The build generates every browser-required PNG size from the canonical production artwork at `public/brand/botbound-app-icon.png` and merges the shared manifest with the target overlay. `assets/icon.svg` remains a browser-readable compatibility wrapper, not a second drawing of the mark.

## In-product install (preferred)

Signed-in customers install from **Apps → BotBound Command** (`/settings/apps/command`).
That page serves the same zips the build copies into `public/downloads/`:

```text
/downloads/botbound-command-chromium.zip
/downloads/botbound-command-firefox.zip
```

The former `wireline-command-*` URLs remain byte-identical compatibility aliases during migration.

Rebuild with `node apps/browser-extension/scripts/build.mjs` whenever shipping a new package so `public/downloads/` stays in sync.

## Local validation

1. Run the build command above.
2. Prefer the in-product download page, or load `dist/chromium` as an unpacked extension in Chrome, Edge, or Opera.
3. Load `dist/firefox` as a temporary add-on in Firefox.
4. Test the toolbar action, selected-text context menu, page context menu, `tel:` link context menu, and `Ctrl/Command+Shift+Y` shortcut.
5. Confirm quick commands exist for Call, Text, Email, and Bot task.
6. Confirm Studio opens with the prefilled brief, the context is visibly labeled as reference, and the URL fragment is removed.
7. Confirm restricted pages do not break the extension and cannot be silently inspected.

## Store release checklist

Before any store upload:

- Keep `/settings/apps/command` as the primary install path; only change posture copy after the matching store listing is live.
- Create browser-specific store screenshots from real extension UI.
- Supply the exact privacy disclosure: active-tab data is read only after an explicit user action and is not retained by the extension.
- Complete Chrome, Edge, Firefox, and Opera store metadata separately; package artifacts are shared where browser policy permits, but store review and listing requirements do not replace each other.
- Run `npm run verify:full`, then manually test the production Studio handoff in each browser.
