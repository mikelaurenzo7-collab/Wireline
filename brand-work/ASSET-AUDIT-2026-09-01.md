# BotBound Promotional Asset Audit — 2026-09-01

## Outcome

All 343 promotional, identity, release, motion-source, launch-ops, and QA files in the audit inventory were inspected or classified. The machine-readable JSON and sortable CSV snapshots are certified in the Google Drive release archive and intentionally excluded from Git; `scripts/build-botbound-promotional-asset-inventory.mjs` regenerates them on demand.

The current outbound release is approved for handoff. Historical, invalid, and superseded files remain preserved for provenance but are explicitly excluded from the outbound release and Google Drive upload.

## Disposition

| Disposition | Files | Decision |
|---|---:|---|
| Approved outbound release | 56 | Publishable package: 54 approved manifest entries plus manifest and release checksum file |
| Preserved inbound release | 62 | Keep as The Second Ring companion campaign |
| Preserved inbound internal proof | 10 | Internal worktree evidence; never describe as deployed-production proof |
| Preserved inbound repair before reuse | 2 | Investor PDF and preview contain missing-arrow rendering; do not reuse until rebuilt |
| Motion source | 58 | Keep as reproducible Remotion source and support files |
| Production identity or package | 43 | Keep BotBound identity; Wireline names remain compatibility aliases only |
| Brand source or control | 18 | Keep canonical identity and control files |
| Historical creative | 22 | Archive; do not select for the outbound campaign |
| Launch authority review | 26 | Consolidate into one active launch registry in a future ops pass |
| Internal worktree proof, not release | 9 | Website verification only; excluded from outbound creative |
| Quarantine: extension mismatch | 10 | JPEG-encoded files named `.png`; excluded |
| Quarantine: invalid loading proof | 16 | Mislabeled/duplicate loading-state captures; excluded |
| Quarantine: invalid proof | 2 | Rejected inbound proof; excluded |
| Quarantine: superseded motion drafts | 9 | Earlier seam-defect iterations; excluded |

## Repairs completed

- Built the outbound-only campaign system, **The First Move**.
- Locked the copy to **FINDS THE LEAD. MAKES THE CALL. BOOKS THE NEXT STEP.**
- Locked the compact campaign line to **FIND. CALL. BOOK.**
- Locked the primary CTA to **GET YOUR SALES BOT**.
- Added an explicit Lead Hunt review and queue handoff before calling.
- Replaced the Appointment Bot guarantee-like line with **CALLS THE WAITLIST. BOOKS THE OPENING.**
- Replaced its outcome receipt with **OPENING / BOOKED**.
- Moved story CTAs into the platform-safe central zone.
- Added an ownable BotBound operator hero and job-specific outcome receipts.
- Added the original no-plugin **POINT IT AT A MARKET. IT FINDS. CALLS. BOOKS.** 4:5 paid-social launch master.
- Completed three outbound motion masters and full-frame QA.
- Replaced the motion claim **DIRECT LINE** with the accurate **PHONE READY**.
- Built and visually verified a selectable-text investor PDF with no missing glyphs.
- Replaced the two-direction campaign share card with a dedicated outbound **FIND. CALL. BOOK.** master while preserving the website's inbound-and-outbound OG separately.
- Reframed the investor expansion story around Sales, Recruiting, Appointments, Reactivation, and Intake so the outbound release remains scope-pure.
- Corrected the final Lead Hunt carousel slide so **YOU TAKE MEETINGS.** clears the right safe margin at feed and full resolution.
- Removed recycled product proof and all draft motion frames from the outbound release.
- Replaced recursive manifest collection with an approved release allowlist.
- Verified the outbound manifest: 54 entries, zero missing files, zero byte mismatches, zero hash mismatches.
- Verified the outbound checksum file: 55 entries, zero defects.
- Repaired the inbound release manifest/checksum: 72 entries, zero defects.
- Repaired the repository source checksum: 51 entries, zero defects.
- Removed the hardcoded historical repository SHA from the inbound manifest builder.
- Deployed the production website with outbound leading while preserving inbound above the fold.
- Retired public voice demos and moved every listening experience behind private account access.

## Website decision

The public message now uses one brand promise and two concise directions:

- **OUTBOUND — FIND. CALL. BOOK.**
- **INBOUND — ANSWER. QUALIFY. ROUTE.**

The homepage offers direct Sales Bot and Front Desk Bot creation paths with no public voice-demo control. The former Showcase route now redirects to private account creation. Sales is the first role, Front Desk is second, and the Sales solution begins with lead discovery or an approved list, then review, queue, call, qualify, book, and record.

## Release acceptance

| Check | Result |
|---|---|
| Outbound-only creative scope | Pass |
| Approved allowlist only | Pass |
| Draft/rejected/loading proof excluded | Pass |
| Source copy matches rendered copy | Pass |
| Static safe zones | Pass |
| Motion dimensions, duration, H.264/AAC decode | Pass |
| Motion frame QA and contact sheet | Pass |
| No spoken dialogue requiring captions | Pass |
| Investor PDF visual render | Pass |
| Investor PDF text extraction and glyph integrity | Pass |
| Website desktop/mobile overflow | Pass |
| Focused TypeScript, contract, and browser checks | Pass |
| Google Drive mirror | Pass — 59 files verified: 56 approved release files plus 3 audit/index files, with zero missing, duplicate, stale, or size-mismatched counterparts |
| Production deployment proof | Pass — `botbound.me` serves exact source commit `ca05255f5beb9cdf54b1bc9274f612ae1545cb52` |

## Do not publish

- Anything in `artifacts/visual-qa/botbound-outbound-motion-drafts-2026-09-01`.
- Anything in `artifacts/visual-qa/candidate-browser-gate*`.
- Anything in `artifacts/creative-audit-2026-09-01` until its extensions are corrected.
- The old inbound investor PDF or preview until rebuilt.
- Worktree screenshots as if they were deployed-production proof.
- Wireline-named compatibility assets in public-facing selections.

## Source-of-truth files

- Outbound release: `brand-work/launch-2026-09-outbound/`
- Outbound manifest: `brand-work/launch-2026-09-outbound/manifest.json`
- Outbound checksums: `brand-work/launch-2026-09-outbound/SHA256SUMS.txt`
- Inventory generator: `scripts/build-botbound-promotional-asset-inventory.mjs`
- Certified JSON/CSV snapshots: Google Drive outbound release archive
