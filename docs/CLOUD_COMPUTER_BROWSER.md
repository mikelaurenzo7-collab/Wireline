# Computer browser capabilities

Computer uses an isolated, non-persistent Chromium context per task. Production
connects through the native Playwright WebSocket in
`CLOUD_COMPUTER_BROWSER_WS_URL`; the connection is server-only. Local Chromium is
development-only. The existing public-network, account, spend, lifetime,
checkpoint, and tenant boundaries apply to every owner tool.

## Current implementation

| Capability                       | Behavior and boundary                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live browser beside conversation | The owner sees the actual hosted browser frame and task activity, and explicitly takes or returns control.                                                                                                                                                                                                                                                                                      |
| Tabs                             | Open, switch, and close real context pages; at most eight, with the last tab retained. Popup pages share this task's isolated context.                                                                                                                                                                                                                                                          |
| Navigation                       | Public web addresses, Back, Forward, and Reload use browser navigation. Private/internal addresses and unsupported protocols remain blocked.                                                                                                                                                                                                                                                    |
| History                          | Last 40 observed navigation locations in process memory. Query strings, fragments, and credential-bearing paths are withheld; some entries intentionally reduce to their origin. This is not a complete browser-forensics record.                                                                                                                                                               |
| Screenshot                       | An authenticated frame can be downloaded by the owner. Live frames are not stored by BotBound and are distinct from masked model screenshots.                                                                                                                                                                                                                                                   |
| Cookie import                    | The owner supplies canonical cookie JSON while controlling the browser. Up to 50 cookies and 64 KB per import, public HTTPS scopes only. Cookies enter this task's isolated context; BotBound never reads the owner's local browser profile.                                                                                                                                                    |
| Clear cookies                    | Explicitly clears cookies in this browser context. Open pages may retain their existing state until reloaded; local/session storage is not cleared by this action.                                                                                                                                                                                                                              |
| Downloads                        | A download may start during an explicit owner click/key/navigation action, for up to 15 seconds after that action. The server streams the native Playwright download, keeps at most three files sharing 20 MB, and imposes a 30-second deadline. Unsolicited/Bot-triggered downloads are canceled.                                                                                              |
| File retrieval                   | Authenticated, tenant-scoped download attachment endpoint, available only while the owner controls this live task. Files are never served as public assets, executed, parsed by the model, or added to the task ledger. Pending downloads are canceled on return/Stop; retained files disappear when the browser closes.                                                                        |
| Session login and autofill       | The owner explicitly saves a username/password for the displayed public HTTPS origin, then explicitly fills it. Each save/fill/clear action includes that expected origin and refuses a changed site. At most eight origins. No value is returned in task/API metadata. Only a single unambiguous main-frame sign-in form is supported; reset/new-password forms and other origins are refused. |
| Persistent passwords             | Not implemented. Session logins disappear when the browser closes, including provider expiry or process restart.                                                                                                                                                                                                                                                                                |
| Extensions                       | Not supported by the current context/connection contract. The toolbar does not claim installation or Chrome Web Store parity.                                                                                                                                                                                                                                                                   |
| Uploads                          | Not supported. The Bot's file-upload and download tools remain disabled.                                                                                                                                                                                                                                                                                                                        |

Cookie values and session-login values stay in memory for model text/screenshot
redaction until the browser closes, even after the owner clears the cookies or
saved login. Imports are refused when the session's private-value memory limit is
reached; old values are not evicted to make room. This exact-literal masking is
defense in depth, not general data-loss prevention against arbitrary website
transformations. A website receiving a cookie/login remains able to use it in its
normal session. Do not enter credentials into an untrusted site.

The 20 MB download limit bounds BotBound's retained bytes. Playwright's native
download stream becomes available after the remote download completes, so the
provider may receive more data before the deadline/size rejection. A stronger
provider-side transfer cap requires a download proxy or browser-worker policy.
File content is untrusted and has not been scanned for malware.

## Network enforcement and compatibility

Session startup requires native Chromium CDP sessions, Fetch request-stage
interception and related-target auto-attachment. A provider that cannot install
these controls is rejected before the browser is returned. Playwright request
routing alone does not intercept redirected requests; the separate CDP guard
checks every HTTP redirect before Chromium sends it, including attachment and
fetch redirects and out-of-process child frames. Only the task's owned pages and
their related child targets are attached; no browser-wide target attachment or
vendor default context is used.

Each page guard bounds paused requests and child commands to 128, related targets
to 64, and individual checks/commands to five seconds. DNS concurrency, host
budgets and deadlines remain bounded per task. Closing a page or removing a
confirmed child target cancels its pending checks; late DNS replies cannot resume
removed targets. Unexpected live interception loss closes the owned browser
context. Interception is never detached as a fallback on a live page.

A popup's first network request may arrive before Chromium exposes its page/frame
handle. That request is aborted until its page has a guard; the owner can recover
using the tab's address bar or New tab. Dedicated/shared/service workers and
WebRTC remain unavailable, including constructors in fresh frames. Sites that
depend on these features need a provider adapter with independently enforced
egress before those channels can be enabled. WebSocket destinations are screened
before the native connection; the WebSocket handshake uses redirect mode `error`
and does not follow HTTP redirects.

The application DNS check and Chromium's eventual resolution are separate.
Request interception does not pin the browser's resolved address, so a hosted
browser still requires independent public-only egress/DNS-rebinding protection,
including its proxies and WebSocket connections. Local response-address checks
and frame blanking are additional read protections, not proof that a network
connection never occurred. Native-protocol synthetic tests are separate from
acceptance against the actual hosted provider's configuration.

## Extending the browser

### Persistent password storage

`src/lib/secret-vault.ts` already provides fail-closed AES-256-GCM envelopes for
integration secrets. It does not provide a browser credential product. A durable
password manager requires all of these additions before enabling its UI:

1. An append-only migration for tenant-owned credential metadata and encrypted
   values, RLS/grants, exact HTTPS-origin scope, account export/deletion, explicit
   owner revocation, and a key-rotation/version policy. Use a domain-separated
   per-tenant key or authenticated tenant/origin binding rather than treating a
   generic encrypted string as proof of ownership.
2. Recent authentication for storing/revealing/deleting credentials; no plaintext
   reveal in ordinary task polling. Reads/decryptions require a currently owned,
   paused browser task and an explicit owner Fill action. An audit event records
   the credential id/action, never its value.
3. Reuse the current atomic same-document origin check and main-frame form
   restrictions. Preserve masking after deletion for the lifetime of any open
   page that could echo the former value. Do not auto-submit a form.
4. Test wrong-tenant/id substitution, redirected/subdomain origins, recovery,
   revoked/expired credentials, key failure, export/deletion, consent, and provider
   teardown. A real owner-entered credential is separate acceptance evidence from
   synthetic fixture tests.

### Extension-enabled hosted contexts

Playwright documents extensions through a **persistent Chromium context** with
launch-time extension arguments. This application deliberately creates a fresh
`browser.newContext()` after connecting; the hosted provider owns Chromium's
launch. Passing a package to this existing context cannot install an extension.
Manifest V3 extensions also use service workers, while the current browser
isolation blocks service-worker and shared-worker escape paths.

A concrete implementation needs a provider adapter or dedicated browser worker
that creates one extension-enabled Chromium process/profile per tenant/task,
then exposes the native Playwright connection without sharing a default context.
Add a strict extension registry with immutable package hashes, reviewed
permissions and update behavior, owner installation/removal, and profile cleanup.
Do not accept arbitrary uploaded extension packages or reuse a personal browser
profile. Extension/background-worker requests need an independently enforced
public-network egress proxy, including DNS rebinding, WebSocket, redirect, and
private-address checks, since page request routing does not cover all extension
traffic. Reconnect, quotas, extension popup/tab state, Stop, expiry, and deletion
must be proven against the selected provider before enabling this capability.
No such provider resource or profile is provisioned by the current change.

## Provider references

- [Playwright browser-context cookies](https://playwright.dev/docs/api/class-browsercontext#browser-context-add-cookies)
- [Playwright native downloads and cleanup](https://playwright.dev/docs/api/class-download)
- [Playwright Chromium extension requirements](https://playwright.dev/docs/chrome-extensions)
- [Playwright CDP sessions](https://playwright.dev/docs/api/class-cdpsession)
- [Chromium Fetch request-stage interception and redirect events](https://github.com/ChromeDevTools/devtools-protocol/blob/master/pdl/domains/Fetch.pdl)
- [Chromium related-target attachment](https://github.com/ChromeDevTools/devtools-protocol/blob/master/pdl/domains/Target.pdl)
- [WebSocket opening handshake and redirect restriction](https://websockets.spec.whatwg.org/#opening-handshake)
- [Browserless connection documentation](https://docs.browserless.io/baas/quick-start)

Source implements these capabilities; a local synthetic test is not proof that a
particular hosted provider configuration has completed a production workflow.
