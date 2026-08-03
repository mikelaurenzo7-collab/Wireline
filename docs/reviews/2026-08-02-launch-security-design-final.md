# Wireline final launch security and design review

Date: 2026-08-02

## Release scope

This pass closes the launch-blocking findings from the current-main audit and standardizes the approved all-caps interface hierarchy without uppercasing authored or long-form content.

## Security and correctness invariants

- Sessions are bound to a database-owned monotonic generation and are revoked on password change and sign-out.
- OAuth pending codes are consumed atomically with their browser bridge state.
- Outbound calls reserve the tenant/number operation before contacting the provider and retain an uncertain state when provider outcome is ambiguous.
- Stripe Checkout uses durable operations and deterministic idempotency keys for both customer and Checkout Session creation.
- Team invitation claims are identity-bound and shared-workspace behavior remains fail-closed until the cross-tenant data plane is certified.
- Webhook tests target one selected endpoint and delivery workers lease pending rows before external delivery.
- Password hashing is asynchronous and password inputs are bounded.
- Fatal uncaught exceptions terminate long-running runtimes after telemetry listeners run.

## Design-system casing contract

Uppercase is reserved for system-authored interface hierarchy: headings, buttons, tabs, badges, navigation, short labels, and compact status controls. Letter spacing and size are role-specific rather than globally uniform.

Original casing is preserved for:

- customer-authored email, SMS, transcript, and artifact content;
- names, email addresses, phone numbers, URLs, identifiers, and literal values;
- legal terms, privacy copy, help prose, guidance, validation, and error detail;
- long-form reports and generated deliverables where sentence case improves reading speed.

Both `.wl-preserve-case` and `[data-wireline-preserve-case]` are canonical authored-content boundaries.

## Verification gate

The release branch must pass the Vercel preview boundary checks, TypeScript application/server/audit targets, zero-warning ESLint, the complete non-E2E Vitest suite, production Vite and server builds, marketing prerendering, and no-database import smoke before merge.
