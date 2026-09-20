# Current Product Proof — Status and Capture Standard

## Current capture workflow

A file named “current” is not evidence of current source. The adjacent JSON must match the intended Git commit and the tracked/non-ignored source fingerprint, pass all seven route checks, and match the screenshot and contact-sheet hashes. Ignored generated files, environment values, installed dependencies, authenticated behavior, and deployed availability are outside that fingerprint.

The September 1 record below is historical. Preserve it as a reference; it does not establish today's UI or deployment state.

For a credential-free local UI review, run these in separate terminals from the repository root, with other heavy checks stopped:

```powershell
node scripts/start-botbound-proof-api-stub.mjs
```

```powershell
npx vite --config scripts/vite-product-proof.config.ts --host 127.0.0.1 --port 3002 --strictPort
```

Then capture:

```powershell
npm run brand:proof
```

The command verifies the local source nonce, records a pre/post source fingerprint, waits for actual route headlines and settled paused Pricing, and produces all seven screenshots plus a contact sheet. Auth and billing responses are **simulated**: the preview is signed out and paid activation is unavailable. This verifies public layout in that state, not provider configuration, checkout, sign-in, or live calling.

Review each full-size image and its final placement. The JSON says `humanVisualReview: required`; passing automation is not visual or publication approval. File names describe logical viewports; screenshots use a 2× device scale. The mobile Home image is a hero crop.

Capture failures preserve the preceding batch. Successful replacements archive it in `exports/product-proof/_history/`; history and `_rejected/` are excluded from release assembly. A stale `.botbound-proof-source-identity.json` after a crashed run must only be removed after verifying no capture is still running. The legacy capture entry point now forwards to this workflow and cannot overwrite the August archive.

After capture and review, assemble the local candidate receipt:

```powershell
node scripts/build-botbound-launch-release-manifest.mjs
```

The builder rejects old provenance, source edits, missing/extra frames, failed route checks, overflow, and mismatched hashes. It records a **creative candidate**, not a production launch. Re-run capture after a new commit or public-source edit. No upload, release, or media purchase occurs.

## Historical status on 2026-09-01

**The September 1 preview was accepted for internal review at that time. It is historical, not current or deployed-production proof.**

The September package contains seven accepted public-surface preview frames and a contact sheet captured from the active Vite source worktree. It also contains two explicitly rejected frames in a local quarantine. Authenticated Studio proof is intentionally absent because this source-only preview did not use production credentials.

The static campaign art and the 6s, 10s, and 15s motion cuts remain illustrations, editorial compositions, product-fact graphics, configured examples, or cinematic concepts. They are not screenshots or recordings of a deployed BotBound product state. The earlier Google Drive proof set captured on localhost on 2026-08-20 is stale for this release. Historical video sources containing a visible authenticated 404 remain rejected.

Historical repository base at the start of the September 1 pass:

- Branch: `master`
- Local base SHA: `13fd4807f43a352d1d7a11da7c03f50460b0caee`
- `origin/main`: `13fd4807f43a352d1d7a11da7c03f50460b0caee`
- Release SHA: **not assigned**; this launch package and the wider production-hardening work remain uncommitted in the active worktree.

Do not describe the base SHA as the final creative or product release. A release record must point to the exact committed and deployed source used for capture.

## Historical exact-worktree preview

- **Label:** EXACT WORKTREE PREVIEW — NOT DEPLOYED PRODUCTION
- **Capture time:** 2026-09-01T07:38:50.637Z
- **Runtime:** Vite source preview at `http://127.0.0.1:3000`
- **Revision:** `master` at base commit `13fd4807f43a352d1d7a11da7c03f50460b0caee`, dirty worktree
- **Machine-readable record:** `exports/product-proof/botbound-current-worktree-proof.json`
- **Review contact sheet:** `exports/product-proof/botbound-exact-worktree-proof-contact-sheet-1920x1400.png`

Accepted preview frames:

| Surface   | Viewport              | Preview status                                              |
| --------- | --------------------- | ----------------------------------------------------------- |
| Home      | 1600 × 1000 desktop   | Accepted for internal exact-worktree review                 |
| Home hero | 430 × 630 mobile crop | Accepted; intentionally ends before the account form begins |
| Features  | 1600 × 1000 desktop   | Accepted for internal exact-worktree review                 |
| Features  | 430 × 932 mobile      | Accepted for internal exact-worktree review                 |
| Pricing   | 1600 × 1000 desktop   | Accepted for internal exact-worktree review                 |
| Pricing   | 430 × 932 mobile      | Accepted for internal exact-worktree review                 |
| Sign in   | 1600 × 1000 desktop   | Accepted for internal exact-worktree review                 |

The capture record reports HTTP 200 for all accepted frames, no horizontal overflow, no page errors, and no console errors. The Home and Sign in captures record the expected locally aborted auth-provider request; that request was not treated as deployed-auth proof.

Rejected and intentionally omitted material:

- `exports/product-proof/_rejected/02-home-mobile-partial-auth-form-rejected.png` — superseded partial-form crop;
- `exports/product-proof/_rejected/08-studio-loading-state-rejected.png` — transient/loading state, not proof;
- authenticated Studio, live call, Inbox continuation, outcomes, approvals, billing activation, and production-number state — not captured in this source-only pass.

The populated Google Drive release may carry the accepted contact sheet and its status documentation for review. That does not elevate the preview to deployed-production certification. The local `_rejected/` quarantine must not be uploaded or published.

## What counts as proof

BotBound launch proof should show an observable product state change, not a generic dashboard:

1. **Build:** create a focused Bot from a blank or clearly labeled demo account.
2. **Train:** add or verify facts, sources, rules, voice, behavior, and workflow boundaries.
3. **Launch:** show the enabled channel, assigned production number, routing, and relevant account state.
4. **Improve:** review a real, explicitly labeled test conversation and its transcript, outcome, note, next action, approval, or handoff.

The strongest proof chain is a clearly labeled test call, a real configured follow-up text or email, and the corresponding outcome/log appearing in BotBound. Dogfood evidence is not customer evidence.

## Required production-certification capture set

To replace the internal preview with public product proof, capture these surfaces from one exact deployed source commit:

| ID  | Surface              | Required state                                                              | Desktop  | Mobile      |
| --- | -------------------- | --------------------------------------------------------------------------- | -------- | ----------- |
| P01 | Home                 | Current public promise and CTA                                              | Required | Required    |
| P02 | Pricing              | Free Builder, plans from $19/month, and actual paid-activation availability | Required | Required    |
| P03 | Create / Build       | Blank-to-Bot creation path                                                  | Required | Required    |
| P04 | Training             | Real labeled demo facts, rules, voice, and behavior                         | Required | Recommended |
| P05 | Voice selection      | Current ten-voice OpenAI roster and saved choice                            | Required | Recommended |
| P06 | Phone / Launch       | Correct number and channel readiness for the demo account                   | Required | Recommended |
| P07 | Live test            | Real test call in progress or completed                                     | Required | Optional    |
| P08 | Inbox / continuation | Real labeled test SMS or email continuation                                 | Required | Recommended |
| P09 | Outcome / Improve    | Transcript, outcome, follow-up, approval, or handoff ready for review       | Required | Recommended |
| P10 | Billing boundary     | Honest Free Builder versus paid-live state                                  | Required | Optional    |

Do not capture secrets, full personal phone numbers, private email addresses, access tokens, provider identifiers, payment data, or real customer data.

## Production-certification procedure

1. Commit the intended release state.
2. Deploy that exact commit to the canonical production host.
3. Verify `https://botbound.me/api/health/public` reports the same source commit before capture.
4. Use the seeded founder account or an explicit demo/test account. Label all activity as test/demo where a viewer could otherwise infer customer production usage.
5. Capture every required surface without route loading, auth redirects, errors, stale banners, obstructing browser chrome, or irrelevant personal data.
6. Verify the production source commit again after capture so a mid-session promotion cannot mix versions.
7. Record the source commit, time, route, viewport, account classification, and file hash for every frame.
8. Review each full-resolution frame at 100%, then inspect its actual crop in every intended placement.
9. Reject the entire set if source provenance, account labeling, or route state is ambiguous.
10. Upload the certified production set into a new versioned proof revision. Do not silently overwrite or relabel the exact-worktree preview; preserve its status and provenance.

## Visual acceptance

Every public proof frame must pass all of these checks:

- BotBound branding and typography are current.
- The Studio identity control does not dominate the workspace.
- The active task and primary action are immediately legible.
- The selected voice and the session-consistency language agree with production behavior.
- No ElevenLabs, voice-cloning, live-avatar, or retired provider surface appears.
- Calls, texts, and email are described as channels of the same Bot, not separate products.
- Twilio is not represented as the intelligence layer; OpenAI is not represented as the carrier.
- The Free Builder and paid-live number boundaries are honest.
- Any booking, follow-up, send, transfer, or handoff is visibly test/demo activity or a configured example.
- Empty states look intentional and do not imply a broken product.
- No 404, stack trace, provider error, disabled control presented as active, loading spinner, or temporary toast is visible.
- Text remains readable after the intended crop.

## Immediate reject conditions

Reject, quarantine, and do not publish any frame that contains:

- the August 20 localhost product-proof state;
- an authenticated 404 or obsolete `/email` route;
- a stale price, retired plan, or unsupported channel;
- a customer, revenue, ROI, adoption, testimonial, or guaranteed-outcome implication without evidence;
- personal, customer, credential, payment, or provider-secret data;
- a mismatched release/source commit;
- generated or fabricated UI presented as the product;
- a claim that a configured action occurred when it did not.

## Release record template

Complete this for the final proof set:

```text
Release name:
Production source commit:
Capture started (UTC):
Capture completed (UTC):
Canonical host:
Pre-capture health commit:
Post-capture health commit:
Account classification: founder-demo | explicit-demo
Reviewer:
Frame inventory path:
SHA-256 manifest path:
Result: CERTIFIED | REJECTED
Notes:
```

## Current release instruction

Use the latest passing, hash-matched local capture for internal UI review only. The September 1 contact sheet remains historical reference. Use the static campaign art as campaign art, the configured-example card as an example, and the motion cuts as cinematic campaign concepts.

Until a completed deployed-production record says **CERTIFIED**, do not market any of those assets as current production-screen proof. Google Drive delivery, visual QA, rendering, captions, hashes, or a clean local capture do not substitute for exact-SHA deployment and authenticated production evidence. Provenance beats polish.
