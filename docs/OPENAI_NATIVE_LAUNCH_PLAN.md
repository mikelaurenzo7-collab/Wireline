# Wireline: OpenAI-Native Launch Plan

## Positioning

Wireline is an operator-controlled voice-agent platform for completing real phone work safely: receive context, make or answer a call, use approved tools, escalate when necessary, and return a useful outcome.

Wireline is **OpenAI-native**, not “officially partnered with OpenAI.” Any formal relationship must be earned through a credible product, excellent operational behavior, and a concrete integration that benefits ChatGPT users.

## Runtime policy

1. **OpenAI primary** for managed structured work and Director-grade planning.
2. **Gemini automatic fallback** only when OpenAI is unavailable or returns a recoverable failure.
3. **OpenRouter is explicit operator choice** per agent. It is never an automatic fallback.
4. **No Anthropic API execution** in managed Wireline traffic.
5. Voice defaults use an OpenAI model supported by the voice carrier; the structured runtime may use GPT-5.5 independently.

## Product tracks

### 1. Reliable agent execution

- Use the OpenAI Responses API for structured planning, coaching, post-call analysis, and guarded operator workflows.
- Require schema-conformant outputs for every action-bearing response.
- Keep tool execution application-owned: Wireline validates authorization, tenant ownership, consent, and business rules before acting.
- Retain clear human handoff for low confidence, sensitive requests, policy conflict, payment, or legal/compliance triggers.

### 2. Voice quality path

- Keep the existing carrier integration stable for launch.
- Establish a staged evaluation of OpenAI realtime voice capabilities against the current Vapi path.
- Do not migrate live telephony merely because a new model exists. Promote only after passing the Voice Readiness Scorecard.

### 3. Evals and quality loop

Every release that changes prompts, tools, models, or call policy must be measured against a fixed Wireline evaluation suite:

| Metric | Launch bar |
| --- | --- |
| Structured output valid JSON/schema rate | >= 99.5% |
| Tool authorization / tenant-isolation pass rate | 100% |
| Correct escalation for sensitive cases | >= 99% |
| Factual grounding on supplied knowledge | >= 95% |
| Unsupported-claim rate | < 1% |
| Post-call action extraction accuracy | >= 95% |
| p95 structured-work latency | tracked per model and workflow |
| Cost per completed task | tracked by model, tenant, and workflow |

Seed cases must cover scheduling, lead qualification, intake, medical-office routing, legal intake, objection handling, voicemail, unsubscribe/DNC, payments, PII exposure, prompt injection, and handoff.

### 4. Safety and trust

- No action without a tenant-scoped authorization check.
- No external tool call from untrusted email, transcript, or web content without instruction/data separation.
- Mandatory recording-consent, DNC, escalation, and communication-policy controls remain server-enforced.
- Audit every model invocation with model, provider, latency, token use, and action outcome.
- Publish only truthful product claims: model-assisted, operator-controlled, and bounded by configured tools and policies.

## ChatGPT integration candidate

The strongest credible integration is not a generic chatbot. It is a secure ChatGPT-facing Wireline app that lets an authenticated user:

1. Review a call outcome.
2. Ask what happened and what requires a decision.
3. Approve or reject a proposed follow-up.
4. Start a bounded, policy-checked task such as scheduling a callback or preparing a call brief.
5. Deep-link to Wireline for agent configuration, transcripts, and compliance controls.

The app should use user-level authentication, narrow tool scopes, clear confirmation for consequential actions, and a compact UI that shows status, next step, and provenance.

## Partnership readiness evidence

Before requesting OpenAI ecosystem attention, Wireline should be able to show:

- A live product with a clean OpenAI-first runtime policy.
- A reproducible evaluation set and trendline of quality improvements.
- A named safety owner, incident response path, and action authorization matrix.
- A privacy/data-flow diagram covering calls, transcripts, integrations, and retention.
- A two-minute product demo: task request -> controlled call -> verified result -> human approval.
- Usage, retention, activation, task-completion, and cost metrics grounded in real customers.
- A narrowly scoped ChatGPT Apps SDK prototype or submission-ready integration.

## 30-day execution order

1. Finish the runtime migration and remove remaining Anthropic package/code references.
2. Add the Wireline evaluation corpus and automated regression gate.
3. Instrument task success, escalation correctness, tool failures, latency, and cost.
4. Build the narrow ChatGPT integration prototype around call review and approval.
5. Produce security/privacy architecture and launch demo assets.
6. Apply to relevant OpenAI developer/community programs only with measurable evidence.

## Non-negotiables

- Never imply endorsement, certification, or partnership without written approval from OpenAI.
- Never trade safety or tenant isolation for demo theatrics.
- Never let a model choice silently override an operator’s explicit OpenRouter selection.
- Never present a model fallback as a successful task without surfacing the provider in telemetry.
