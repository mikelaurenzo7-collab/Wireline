# Guided Agent Setup — 2026-07-08

**Status:** Active product doctrine.  
**Surface:** `src/components/PhoneAgentBlueprint.tsx`.  
**Shared model:** `src/lib/guided-agent-learning.ts`.

## Decision

Wireline should not ask users to configure an abstract voice agent. It should guide them into a better call operator by asking one useful question at a time, teaching the tradeoff, capturing structured behavior, and checking readiness before launch.

This is not a school feature. It is a SaaS activation pattern.

## Why the existing builder needed a narrow upgrade

The existing call-plan builder was directionally right because it saved real staged behavior: welcome, understand, resolve or route, recap. The gap was not that agent creation was broken. The gap was that a first-time user could choose a use case without first deciding whether the agent should make calls, answer calls, or do both.

That matters because direction changes the job:

| Direction | User meaning | Operating loop |
| --- | --- | --- |
| Outbound | Starts from an approved list or campaign. | List -> Script -> Dial -> Log |
| Inbound | Answers live calls and routes or resolves. | Route -> Answer -> Resolve -> Log |
| Hybrid | Answers calls and makes approved follow-up calls. | Answer -> Act -> Follow up -> Sync |

## The Wireline learning loop

1. **Ask** — one focused setup choice at a time.
2. **Teach** — explain the tradeoff in plain language before asking for details.
3. **Capture** — turn the user's answers into role, caller/list, outcome, handoff, and guardrails.
4. **Check** — require a concrete plan before save or launch.

## Product rules

- Keep Create short. Do not turn first-run setup into a questionnaire maze.
- Put guided detail in Training / Call plan, where the behavior is actually saved.
- Always ask direction before use case when call behavior is being configured.
- Do not save vague plans such as "sales," "book," or "be helpful" as if they are launch-ready.
- Readiness must check five things: role, caller/list, success outcome, human takeover, and boundaries.
- The UI should teach in one sentence, then let the user act.

## Success demand

This pattern succeeds only if it improves the first real call. The standard is:

- The user understands outbound vs inbound vs hybrid without reading docs.
- The saved call plan contains a specific role, audience/list, outcome, handoff, and boundary.
- A risky or vague call plan is blocked until clarified.
- The agent's generated stages preserve the selected direction.
- The user can explain what the agent will do before funding live usage.

## Verification

- `tests/guided-agent-learning-contract.test.ts` guards the Ask -> Teach -> Capture -> Check loop.
- `tests/guided-agent-learning-contract.test.ts` guards outbound, inbound, and hybrid direction loops.
- `tests/guided-agent-learning-contract.test.ts` guards readiness scoring and real builder wiring.
- `npm run verify:contracts` includes the guided setup contract.
