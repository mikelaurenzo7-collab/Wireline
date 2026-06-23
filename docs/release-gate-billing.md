# Release gate: GitHub billing-blocked CI

GitHub Actions can currently fail before job materialization because the connected account or organization billing state blocks runner execution. Treat that condition as an external release-gate infrastructure blocker, not an application-code regression.

## How to identify the blocker

Use this classification when all of the following are true:

- Pull request checks show no actionable job steps or logs.
- Workflow runs are missing, empty, or stop before runner startup.
- CodeQL or external checks may still report independently.
- Vercel deployments continue to build normally for the same commit or pull request.

## Temporary release policy

Until GitHub billing is restored and Actions jobs materialize normally:

1. Do not describe GitHub Actions `startup_failure`, blank jobs, or missing logs as app-code failures.
2. Use Vercel preview/production readiness, runtime logs, PR diff review, and targeted repository checks as the practical release gate.
3. Keep database migration safety as a hard gate: preview builds must not run shared production migrations.
4. Prefer small, coherent changes that can be reviewed directly through the diff.
5. Squash merge only when the reviewed change is low risk, deployment implications are understood, and no material security/data impact is introduced.

## Recovery criteria

Return to normal CI gating once GitHub Actions can create jobs, stream logs, and complete the repository's expected workflows on a fresh pull request.

## Carry-forward notes

- PR #540 remains a valid health-probe cache improvement, but should still be reviewed against current `main` before merging.
- The unsafe Vercel preview migration behavior has already been corrected by routing `vercel-build` through the guarded build wrapper.
- The unrelated `Vercel - v0-project` status should be removed or disconnected from the GitHub integration when the owning installation is accessible.
