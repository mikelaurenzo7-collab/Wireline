# Production Visual QA

Status: **Active**

Wireline's production visual gate captures every launch-facing route as a settled, true viewport. It is deliberately strict: a public-only run, a missing screenshot, a route redirect outside the declared lifecycle, an unresolved loading surface, or any unexplained diagnostic fails the manifest gate.

## Canonical matrix

The source of truth is `scripts/visual-qa-matrix.mjs`:

- 39 public and lifecycle routes.
- 24 authenticated workspace routes, including a real demo-agent Studio deep link.
- 15 viewports (945 screenshots total).
- Breakpoint seam pairs at 639/640, 767/768, and 1023/1024 pixels.
- Real phone, tablet, short-laptop, desktop, wide-desktop, and Full HD dimensions.

Each route produces one PNG whose dimensions must exactly match its CSS viewport. `fullPage` screenshots are not release evidence because Wireline's marketing and workspace shells use bounded, nested scrolling surfaces; browser-level full-page stitching can omit those surfaces or return a misleading header-only image.

## Run the capture

```bash
WIRELINE_QA_FOCUS=full \
WIRELINE_VISUAL_BASE_URL=https://trywireline.com \
WIRELINE_VISUAL_OUTPUT_DIR=artifacts/visual-qa-prod \
node scripts/capture-prod-visual-qa.mjs
```

The runner signs into `WIRELINE_VISUAL_EMAIL` and `WIRELINE_VISUAL_PASSWORD` when both are present. Otherwise it creates a disposable demo account, creates or discovers one demo agent through the current Fast Start flow, closes the setup guide, and then captures the authenticated matrix. The demo email is recorded for cleanup; passwords and auth secrets are never written to the manifest.

Gate the newest manifest explicitly:

```bash
node scripts/check-visual-qa-manifest.mjs artifacts/visual-qa-prod/<run>/manifest.json
```

The pull-request workflow's smaller, unauthenticated localhost probe uses the explicit `--smoke` profile. The default checker is always the strict production gate; only `--smoke` retains the legacy P0 layout/navigation check for a server that has no database or demo-account credentials.

## What the gate proves

For every route and viewport the manifest records and verifies:

- navigation status and final route;
- exact PNG width and height from the PNG header;
- sampled color/luminance evidence against blank captures;
- one route-level `h1` and a resolved document title;
- duplicate IDs;
- visible broken images;
- page-level and visible-control horizontal overflow;
- bounded nested-scroll surface dimensions and scroll position;
- unresolved busy/loading surfaces;
- required Fast Start modal presence and unexpected modal absence;
- browser console, page, request, and failed-response errors.

Expected anonymous session probes and blocked third-party analytics are recorded separately as ignored events. Everything in `issues` is unexplained by default and fails CI. If a product owner deliberately accepts a finding, the manifest may mark that individual issue `explained: true`, with the rationale preserved alongside the release artifact; the capture runner itself does not auto-explain product failures.

## Continuous gate

`.github/workflows/production-visual-qa.yml` runs the full matrix after changes to application source, public assets, styles/design tokens, capture code, manifest gates, or the workflow itself land on `main`. The job always runs the manifest checker and uploads the evidence bundle, including on failure.

Generated screenshots and manifests stay under `artifacts/` and must not be committed.
