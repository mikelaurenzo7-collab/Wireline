# Wireline Deployment Runbook

This root path is retained for legacy links and development-tool discovery. The canonical, maintained runbook is [docs/DEPLOYMENT_RUNBOOK.md](./docs/DEPLOYMENT_RUNBOOK.md).

## Required release posture

- Start from the latest `main` commit and use a focused branch.
- Require validation for the exact branch head; a green stale deployment is not release evidence.
- Preview builds must use sandboxed or unset provider credentials and must skip shared-database migrations.
- Use `npm run verify:full` for auth, billing, compliance, provider, shared-runtime, or migration changes.
- Require the exact-head Vercel preview to be READY and resolve all CodeRabbit review threads.
- Squash merge with the expected head SHA, then follow that squash SHA into production.
- Verify `trywireline.com`, `/api/health`, migrations, changed routes, and production runtime errors after release.

`.env.example` is the canonical environment-variable inventory. Do not copy credentials, provider identifiers, phone inventories, or mutable dashboard state into this compatibility file.
