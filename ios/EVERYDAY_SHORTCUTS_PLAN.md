# Wireline — everyday Siri + Shortcuts plan

Wireline's primary consumer promise is simple: **ask Wireline to handle everyday phone work for you**. Business calling remains supported, but the default product posture is personal delegation:

- "Have Wireline call the doctor and tell them I'm running late."
- "Siri, have Wireline take this."
- "Ask Wireline to call the pharmacy and check if my prescription is ready."
- "Tell Wireline to call the restaurant and move my reservation to 7:30."
- "Ask Wireline what calls need my attention."

The implementation should make these flows feel native across Siri, App Shortcuts, widgets, the Action button, Back Tap, Control Center, Spotlight, and the app. CarPlay is only the low-distraction calling surface for a subset of the same personal call actions.

## Product north star

Wireline is an **everyday call concierge**. It makes, receives, summarizes, and hands off routine phone calls with the user's explicit intent. The app should lead with personal scenarios first:

| Everyday job | Example user wording | Product behavior |
| --- | --- | --- |
| Notify someone | "Call the doctor and say I'm running 10 minutes late." | Place an outbound call through the selected/default Wireline agent with the user's message. |
| Reschedule | "Call the dentist and move my cleaning to next week." | Place a call with the rescheduling goal and save a follow-up if unresolved. |
| Check status | "Call the pharmacy and check if my prescription is ready." | Place a call, summarize the answer, and flag if the user must act. |
| Wait on hold | "Call support and get me when a human is on." | Start the call and offer handoff when the live person is ready. |
| Take over | "Have Wireline take this." | Transfer an eligible live call to the user's callback number. |
| Remember outcomes | "What happened on my last call?" | Speak a short recap and open the call detail for longer notes if needed. |
| Triage | "What calls need my attention?" | Speak a count/short digest of unresolved calls. |

## Shortcut surface inventory

| Surface | Everyday promise | Implementation posture |
| --- | --- | --- |
| Siri / App Shortcuts | Natural language entry for outbound calls, handoff, recaps, and triage. | Auto-register App Shortcuts; keep phrases broad and parameterized where iOS allows. |
| Shortcuts app | Power-user automations like "When I leave work, ask Wireline to call home." | Expose small, composable App Intents with clear parameters and no hidden side effects. |
| Action button | One-press "Ask Wireline" for iPhone 15 Pro+ users. | User-assigned only; app explains setup but cannot claim the hardware button. |
| Back Tap | Accessibility-friendly shortcut to Ask Wireline. | User-assigned only through iOS Settings. |
| Lock Screen / Home widgets | Fast launch into Ask Wireline and recent call follow-up. | Widgets deep-link into `wireline://ask` and call details. |
| Control Center | Fast launch for Ask Wireline. | Deep-link through the same URL route when user adds a shortcut. |
| Spotlight | Discoverable "Open Wireline" and suggested shortcuts. | Provided by App Shortcuts metadata. |
| CarPlay | Safe callbacks, live handoff, and agent visibility while driving. | Communication templates only; show active-call/live-ops status and agents, but no dashboards, setup, or free-form reading/composing in the car UI. |
| Apple Watch | Future glanceable trigger for Ask Wireline / take this call. | Roadmap; mirror the same App Intents. |

## Intent catalog

### Shipped / near-term intents

| Intent | User-facing examples | Required parameters | Should launch app? | Notes |
| --- | --- | --- | --- | --- |
| Ask Wireline | "Ask Wireline", "Siri, ask Wireline for help." | Optional free-text request in future. | Yes | Opens the general composer today. |
| Place a call | "Have Wireline call the doctor and say I'm late." | Contact or phone number, optional instruction, optional agent. | No | Core everyday action. Should support default agent/contact resolution over time. |
| Take this call | "Have Wireline take this." | Infers the latest eligible live call. | No | Shipped as `TakeThisCallIntent`; transfers to the user's saved callback number and reports setup/conflict states. |
| Summarize last call | "What happened on my last call?" | Optional contact filter in future. | No | Keep spoken output short; longer detail opens in app. |
| What needs attention | "What calls need my attention?" | Optional timeframe/category in future. | No | Speak counts first, then the top follow-up. |
| Open Wireline | "Open Wireline." | None. | Yes | Standard launch. |

### High-value future intents

1. **Call a contact with a message** — resolve Contacts entries so users can say "call Mom" or "call my doctor" instead of dictating a number.
2. **Call a business by name** — resolve nearby or saved businesses such as pharmacies, restaurants, salons, schools, vets, and utility companies.
3. **Reschedule an appointment** — collect who, existing appointment, preferred windows, and constraints.
4. **Check availability / price / status** — ask a business a bounded question and summarize the answer.
5. **Book an appointment** — collect category, timing, location, and confirmation preference.
6. **Cancel an appointment** — call with guardrails and require confirmation for irreversible actions.
7. **Wait on hold for me** — call, monitor for a human, then hand off.
8. **Send me the recap** — push/email the summary instead of reading it aloud.
9. **Add a reminder from last call** — convert an action item into EventKit with confirmation.
10. **Call back my last missed call** — strongest CarPlay-compatible driving shortcut.

## Guardrails for everyday use

- Require explicit user initiation for outbound calls; do not let background automations place surprise calls.
- Confirm before calls that may create costs, bookings, cancellations, medical/legal/financial commitments, or irreversible changes.
- Never present Wireline as emergency calling or as a substitute for 911/local emergency services.
- Keep Lock Screen, Siri, and CarPlay responses privacy-preserving: short, no sensitive transcript dumps, and open the app for details.
- Keep healthcare, school, finance, and government calls framed as user-directed communication assistance, not professional advice.
- Make callback-number setup personal and upfront so "take this call" works for everyday users without hunting through settings.

## App Store positioning

Lead with consumer copy:

> Wireline is your personal call concierge. Ask it to call the doctor, pharmacy, restaurant, school, landlord, airline, or support line with a clear message; it reports back with the outcome and lets you take over when needed.

Business users still fit as a secondary audience:

> Teams can also use Wireline for business lines, missed-call follow-up, live-ops handoff, and customer callbacks through the same calling workflow. In CarPlay, business mode can show active calls and agents as communication status, not as an operations dashboard.

Avoid App Store claims that imply unsupported autonomy: guaranteed bookings, emergency response, legal/medical/financial decisions, or control of other apps' CarPlay experiences.

## Build priorities

1. Make the current `CallAgentIntent` feel personal by documenting examples around doctors, pharmacies, restaurants, family, schools, landlords, airlines, and support lines.
2. Add a first-run callback-number prompt so "take this call" works before users encounter live handoff.
3. Add contact/business resolution so users can speak names instead of phone numbers.
4. Add richer ambiguity handling for multiple eligible live calls before handoff.
5. Add Shortcuts-friendly intents for reschedule/check-status/book/cancel that all reuse the same outbound call primitive with clearer parameters and confirmations.
6. Add privacy-preserving notification and widget affordances for unresolved everyday follow-ups.
7. Keep CarPlay advanced but compliant: live calls first, one-tap handoff, recent callbacks, business workspace identity, and agent line visibility only.
