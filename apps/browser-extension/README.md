# Wireline Command

Wireline Command is a privacy-minimal browser command surface for Wireline Studio.

The website remains the full operating system for setup, billing, training, Wire (connections), Phone, Inbox, launch, and review. The extension exists for the moment when a customer is already inside a browser tab and wants Wireline to act with that page as context.

It lets a signed-in Wireline customer deliberately bring the active page, text they select, or a linked contact into the existing Studio workflow, where all agent configuration, authorization, consent, billing, and launch controls remain server-owned.

## What it supports

- **Chrome, Microsoft Edge, and Opera:** one Chromium Manifest V3 artifact using the browser side-panel API when available.
- **Firefox:** one Manifest V3 overlay using Firefox's native sidebar action.
- **Fallback:** opening Studio in a tab if a sidebar cannot be opened by the host browser.

## Product role

- Prepare a call from the current page or a `tel:` link.
- Draft a text from page context.
- Create a follow-up from selected text.
- Send an agent task into Studio.
- Jump to Agents, Integrations, Usage, or Studio.

## Privacy contract

The baseline package intentionally has:

- no `host_permissions`
- no `<all_urls>` access
- no persistent content script
- no Wireline session-token storage
- no background sync or page harvesting

The extension reads the active page only after a user action. It captures a constrained title, URL, meta description, and explicit selection; it opens Studio with that context inside the URL fragment so the browser does not send it as part of the initial HTTP request. Studio immediately removes the fragment and presents the material as reference-only text for the user to review.

## Explicit context workflows

Wireline Command should be a competitive advantage because every workflow is explicit and reviewable. The approved product workflows are:

1. **Prepare call from this page** — send the active page title/URL/selection only after the user clicks the command, then ask for call confirmation in Studio before any live call.
2. **Extract facts into Training** — turn selected page context into proposed knowledge or directives that the Account Holder can review.
3. **Draft follow-up** — use the current page or selection to draft a text/email/call recap without sending it automatically.
4. **Send to Studio** — hand the context to the selected agent workroom for review, simulation, or next action.

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

The build generates the browser-required PNG icon sizes from `assets/icon.svg` and merges the shared manifest with the target overlay.

## Local validation

1. Run the build command above.
2. Load `dist/chromium` as an unpacked extension in Chrome, Edge, or Opera.
3. Load `dist/firefox` as a temporary add-on in Firefox.
4. Test the toolbar action, selected-text context menu, page context menu, `tel:` link context menu, and `Ctrl/Command+Shift+Y` shortcut.
5. Confirm quick commands exist for Call, Text, Follow-up, and Agent task.
6. Confirm Studio opens with the prefilled brief, the context is visibly labeled as reference, and the URL fragment is removed.
7. Confirm restricted pages do not break the extension and cannot be silently inspected.

## Store release checklist

Before any store upload:

- Replace preview status in `/settings/apps` only after the matching store listing is live.
- Create browser-specific store screenshots from real extension UI.
- Supply the exact privacy disclosure: active-tab data is read only after an explicit user action and is not retained by the extension.
- Complete Chrome, Edge, Firefox, and Opera store metadata separately; package artifacts are shared where browser policy permits, but store review and listing requirements do not replace each other.
- Run `npm run verify:full`, then manually test the production Studio handoff in each browser.
