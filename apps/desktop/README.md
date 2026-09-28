# BotBound Desktop

An owner-directed desktop client for Windows and macOS. Choose a Bot, share one application or browser window and/or approved MCP tools, and give it a task. The owner reviews each proposed action with its exact arguments and destination before execution. The existing browser extension remains a separate context-capture surface.

This package is under validation. Build outputs are unsigned development artifacts, not public downloads or store releases. A successful build does not certify native permissions, operating-system behavior, signing, or live task completion on both platforms.

## Local development

Use Node 22.12 or newer in the repository's Node 22 line. From this directory:

```sh
npm ci
npm run typecheck
npm run build
node native/build.mjs
npm start
```

The native build requires the platform tooling documented under `native/`. Windows and macOS helpers must be built and exercised on their respective operating systems. No provider credentials belong in source or build output.

Electron **44.4.5** and Forge **7.11.2** are pinned to the official stable releases verified on September 28, 2026. TypeScript follows the repository's 6.0.3 version. Dependencies have a separate lockfile; the main web/API package remains independent. See the [Electron stable releases](https://releases.electronjs.org/release?channel=stable) and [Forge release](https://github.com/electron/forge/releases/tag/v7.11.2).

The root release gate and PR CI run `npm run desktop:deps` once before desktop typecheck/build and the shared tests. The full release gate also runs `npm run desktop:audit` against all desktop dependencies, including packaging tools. Run the dependency command explicitly after a fresh root checkout before standalone root tests that import desktop modules. This locked CI install uses `--ignore-scripts` to avoid downloading or launching Electron; esbuild uses its installed platform optional package. For an actual desktop development launch, run ordinary `npm ci` in this directory so Electron's runtime is downloaded. Tests never install dependencies themselves.

## Task interface

1. Connect to BotBound using the browser authorization flow and select your Bot.
2. Select one window, or use MCP tools only. For MCP, add a trusted HTTPS endpoint, inspect its tool descriptions and schemas, and approve a selected catalog. Choose the connection for this task.
3. Describe the goal and explicitly consent to sharing task data, the selected window's screenshots, and selected MCP tool data with BotBound and its AI providers (OpenAI/Gemini).
4. Inspect each proposed action. **Approve once** authorizes only the displayed proposal. Text from the model, page, and tool is rendered as text, never executable markup.
5. Use **Stop** at any time. It remains available during pending actions. Stopping cannot undo an action already sent to a remote tool. An unconfirmed outcome blocks further work until you check the destination and choose **Acknowledge outcome**; acknowledgment preserves its unconfirmed status and never retries the action.
6. Review the result in the destination before marking the task complete. Action receipts remain visible, including failed or unknown outcomes.

**Disconnect everywhere** also revokes this account's BotBound Desktop cloud-planning grants on other computers. It does not erase owner-managed MCP credentials or undo local actions already approved elsewhere.

A token exchange records an encrypted **connection unconfirmed** marker before sending a one-use code or refresh token. If the response is lost or the app restarts mid-exchange, planning and reconnection remain blocked. Open the Apps settings for the account used to connect, revoke BotBound Desktop (or verify that no connection exists), and explicitly confirm that review before resetting the local connection. This acknowledgment is not a server revocation receipt. When the issued credential is available, Disconnect and normal shutdown revoke it automatically; failed revocation keeps recovery available.

The renderer is local static HTML/CSS/JavaScript, with no Node access, remote content, or network permission. Main configures Electron's sandbox and context isolation. A narrow preload exposes named task operations; it never exposes arbitrary IPC, filesystem paths, shell commands, or credentials. Fonts and artwork are copied from the existing BotBound assets during the build.

## Platform artifacts

Build on the target operating system and architecture:

```sh
# Windows host
npm run package:win
npm run make:win

# macOS host (uses the host architecture)
npm run package:mac
npm run make:mac
```

Every packaging command first compiles the native helper on the target operating system, then verifies its platform, architecture, source hash, and binary hash before invoking Forge. A Windows build cannot substitute for the required macOS Swift build. Helpers are copied into `resources/native/win32/BotBound.Native.exe` or `resources/native/darwin/BotBound.Native`; they are not executed from inside ASAR. The Windows maker produces Squirrel installer files and a ZIP. macOS produces an app ZIP. Output remains in ignored `out/`.

For native-only debugging, run `node native/build.mjs --platform win32 --arch x64` on Windows, or `node native/build.mjs --platform darwin --arch arm64` on Apple Silicon (use `x64` on an Intel Mac). Packaging always uses the host architecture and rebuilds this prerequisite.

The separate `desktop-native.yml` workflow compiles Windows and macOS helpers when native sources change, or on manual dispatch. It uses the official .NET 10.0.401 SDK on Windows and the runner's Xcode Swift compiler on macOS, then checks source/binary provenance. It never launches the helper or sends operating-system input. A queued workflow or a successful Windows build is not evidence of a successful macOS compile; interactive platform acceptance remains separate even after both compile jobs pass.

Signing is intentionally not configured in `scripts/forge.config.cjs`. Before public distribution, configure and validate Windows Authenticode signing and macOS Developer ID signing plus notarization using secured credentials. Do not add keys or passwords to the repository. Follow the official [Windows signing guide](https://www.electronforge.io/guides/code-signing/code-signing-windows) and [macOS signing guide](https://www.electronforge.io/guides/code-signing/code-signing-macos). No signing service, certificate, or developer-program purchase is performed by these scripts.

### Dependency audit

The desktop lockfile is audited separately from the web/API lockfile, including build tools. Ajv 8.20.0 includes the fix for the older `$data` regular-expression denial of service. Forge 7.11.2 still resolves older archive utilities, so narrow overrides pin `tar` 7.5.22 and `tmp` 0.2.7 while preserving the extraction and temporary-name APIs its consumers use. The packager's `extract-zip` dependency is aliased to Electron's maintained `@electron-internal/extract-zip` 1.0.5, using the same `await extract(path, { dir })` interface under Node 22.12 or newer. Focused tests exercise the actual packager entry point, tar file/stream extraction, and temporary-file integration. See [Electron's extractor](https://github.com/electron/extract-zip) and the [Ajv release](https://github.com/ajv-validator/ajv/releases/tag/v8.20.0).

The unused DMG maker is omitted: its `appdmg` dependency requires an old vulnerable `image-size` API, and replacing it with a current major version would be incompatible. macOS app ZIP packaging, signing, and notarization remain supported build paths. No vulnerability is suppressed or accepted by the release gate.

## Required release evidence

- Focused IPC and renderer tests, desktop typecheck, and compiled package inspection.
- Windows and macOS native window-selection, permission-denial, stale-window, stop, and action-result checks on the actual platform.
- Browser-window and desktop-app tasks with visible owner approval; MCP schema/catalog changes and ambiguous tool results must remain closed to automatic replay.
- OAuth connect/disconnect and encrypted local state recovery on both operating systems.
- Signed/notarized artifacts and installation checks before publishing any download or readiness claim.
