export interface BlogPostRecord {
  id: string;
  title: string;
  date: string;
  author: string;
  excerpt: string;
  body: string;
  readingTimeMinutes: number;
}

function estimateReadingTime(body: string) {
  const words = body
    .replace(/^#+\s+/gm, "")
    .split(/\s+/)
    .filter(Boolean).length;

  return Math.max(4, Math.round(words / 220));
}

function createPost(post: Omit<BlogPostRecord, "readingTimeMinutes">): BlogPostRecord {
  return {
    ...post,
    readingTimeMinutes: estimateReadingTime(post.body),
  };
}

export const BLOG_POSTS: BlogPostRecord[] = [
  createPost({
    id: "voice-ai-benchmarks-sub-400ms-response-times",
    title: "Voice AI Benchmarks: How We Hit Sub-400ms Response Times",
    date: "2026-05-12T09:00:00.000Z",
    author: "Mike Lorenzo",
    excerpt:
      "Fast voice agents are the result of ruthless latency budgeting across speech detection, model inference, and speech synthesis. Here is the stack and the tuning discipline that let Wireline answer live calls with a response loop that feels close to human.",
    body: `# Fast enough to feel interruptible

Most voice AI demos focus on whether the model sounds smart. In production, callers judge something earlier: how long they sit in silence. If a caller asks a question and waits a full second before hearing anything back, they do not experience intelligence. They experience doubt. That is why our internal benchmark became simple and unforgiving: on common receptionist flows, the system needed to start responding in under 400 milliseconds after endpointing. Below that line, callers interrupt naturally and stay engaged. Above it, the assistant starts to feel staged.

Wireline reached that range with a stack built on Vapi for telephony orchestration, ElevenLabs for speech synthesis, Claude for reasoning, and a tuning layer that removes waste between each step. The breakthrough was not one model swap. It was treating latency as a product feature.

## Start with a latency budget

Before we tuned anything, we split the turn loop into measurable buckets: endpoint detection, transcript finalization, model first token, and first audio playback. That sounds obvious, but many teams skip it and jump straight into prompt debates. In practice, the model is often not the largest delay.

Our working budget looked like this:

- 80 to 120 milliseconds for endpointing
- 60 to 90 milliseconds for transcript handoff
- 120 to 160 milliseconds for first-token model output on common intents
- 80 to 120 milliseconds to begin speech playback

Once we had those boundaries, tradeoffs became easier. If a prompt change added 40 milliseconds, it had to materially improve correctness. If a retrieval step made the system slower without changing the answer on common calls, it was cut.

## Vapi helped because we could focus on conversation design

Vapi gave us the call transport, live streaming, and interruption behavior we needed without forcing us to rebuild telephony from scratch. That mattered because hand-rolled telephony layers usually add buffering, state bugs, and operational drag long before they add product value.

The biggest gain was control over the live conversation loop. We shortened silence windows where confidence was high, treated quick backchannels differently from real questions, and let the assistant prepare a response before the caller’s final word was polished into perfect transcript text. The key insight was that callers care more about conversational momentum than transcript perfection.

## ElevenLabs only feels premium if you keep it fast

ElevenLabs gave us the voice quality we wanted, but premium voice quality can become a latency trap if every turn is treated like a cinematic monologue. Reception workflows do not need cinematic. They need immediate.

Three adjustments mattered most:

- We standardized a small set of production voices and kept them warm.
- We wrote prompts for speakability, using shorter, cleaner clauses.
- We trained the agent to open with a useful sentence and elaborate only if the caller kept engaging.

That last point improved more than speed. Human receptionists rarely begin with a paragraph. They answer, orient, then expand. Once the assistant copied that rhythm, both latency and call quality improved.

## Claude got faster when we asked it to do less

Claude handled the reasoning layer well, but prompt discipline mattered more than raw model capability. Early versions of the system were bloated: broad policy blocks, too much business context, and instructions repeated every turn. That made the model slower and more verbose.

We moved to a slimmer pattern:

- a compact system frame for role and tone
- a small business snapshot relevant to the current workflow
- short-lived turn memory instead of replaying the whole conversation
- tool access gated by the current intent

The result was better first-token latency and tighter responses. The simplest way to make a real-time model faster is often to stop making it solve every possible problem at once.

## Time-to-first-audio matters more than total completion

Benchmarks often focus on when the full answer is done. Callers care about when speech starts. We optimized for time-to-first-audio and changed prompts so the first clause could stand on its own. “I can help with that. What address should I use?” works better than a long setup sentence, even if the total answer is eventually the same.

Streaming partial output through the stack was critical here. We stopped waiting for a perfect paragraph and started synthesizing once the response crossed a confidence threshold. That made the assistant feel more present even when the rest of the sentence was still in flight.

## The biggest wins were boring

The most valuable performance work was not glamorous.

- Keep hot paths warm
- Cache tenant configuration close to the voice runtime
- Skip heavy retrieval on routine intents like hours, pricing, and service area questions
- Trim post-processing on simple turns
- Instrument every stage so regressions show up quickly

That is the unsexy truth of production voice systems: the gap between an impressive demo and a dependable product is mostly operational hygiene.

## Fast systems still need graceful fallback

Latency wins disappear the moment a dependency slows down unless fallback behavior is built in. If speech synthesis drifted up, we shortened answer targets. If a tool dependency lagged, the assistant acknowledged progress and asked one clarifying question instead of freezing. If the model crossed a response threshold, it biased toward a direct answer and a faster next step.

We also benchmarked under messy conditions, not just lab conditions. Real callers interrupt, change course, speak over noise, and force the stack to recover mid-turn. A latency number only matters if the system still feels natural when the call gets messy.

## What I would recommend to any team building voice AI

If you are chasing lower latency, do the basics first:

- measure endpointing, model, and TTS separately
- optimize time-to-first-audio instead of only total turn time
- shorten prompts before chasing exotic architecture changes
- pre-warm the voices and workflows you use most
- design fallback behavior before production traffic forces it on you

Sub-400-millisecond voice AI is achievable with today’s infrastructure. The vendors matter. The tuning discipline matters more.`,
  }),
  createPost({
    id: "hvac-shop-answering-service-replacement",
    title: "How a 3-Person HVAC Shop Replaced Their Answering Service with Wireline",
    date: "2026-04-28T09:00:00.000Z",
    author: "Mike Lorenzo",
    excerpt:
      "A small HVAC business did not need an enterprise call center; it needed a system that could catch after-hours calls, qualify urgency, and stop leaking revenue to voicemail. This customer story breaks down how a three-person team replaced a legacy answering service with Wireline and what changed in the first six weeks.",
    body: `# The problem was not call volume. It was call timing.

This customer was a three-person HVAC shop: one owner, one field tech, and one office coordinator who also handled billing, scheduling, and dispatch. They were not fielding hundreds of calls a day. They were missing a smaller number of very valuable calls at exactly the wrong moments: after hours, during lunch, while the coordinator was already on another line, or when the owner was driving between jobs.

They already had an answering service, but the experience was inconsistent. Messages arrived late, details were vague, and urgent service requests were mixed together with routine questions. On paper, they had coverage. In practice, they still had leakage.

## What the shop actually needed

The owner did not ask for a futuristic “AI transformation.” He wanted four concrete outcomes:

- answer every inbound call, especially nights and weekends
- separate true emergency requests from routine inquiries
- capture usable details the first time
- hand the team a clean next action instead of a loose voicemail

That framing mattered. Small businesses do not buy categories. They buy relief from a specific bottleneck.

## Why the old answering service underperformed

The invoice from the answering service looked manageable: monthly retainer, per-message fees, after-hours charges. The hidden cost was much larger.

- Some callers never left voicemail at all.
- Some urgent calls were relayed too slowly to save the job.
- Many messages arrived missing addresses, equipment details, or the real reason for the call.
- The coordinator still had to spend time translating notes into something dispatchable.

The owner eventually realized he was paying for a message-taking system, not a resolution system.

## Deployment was intentionally simple

We did not start with a giant workflow map. We launched one dedicated number, one HVAC-specific reception flow, and a clear set of collection fields. The agent could answer common questions about service areas, hours, financing, and maintenance plans. More importantly, it could capture:

- caller name
- service address
- best callback number
- issue summary
- urgency indicators like “no heat,” “system won’t start,” or “water leak”

We also matched the escalation logic to the way the shop actually operated. A no-cooling call on a mild day is not the same as no heat during a winter cold snap. An active leak matters more than a tune-up request. The agent worked because it mirrored the business’s priorities instead of forcing a generic script.

## The trust hurdle was emotional, not technical

The office coordinator’s main concern was that customers would hate talking to AI. That fear comes up constantly in SMB deployments. People picture a stiff robot trapping callers in menus.

So the first version of the workflow was deliberately modest. The greeting was short. Questions were sequential. The system did not try to sound clever. It tried to sound competent. Just as important, it had a clear escape hatch. If a caller sounded frustrated, explicitly asked for a person, or described something unusual, the workflow shifted from “fully solve this” to “capture the essentials and route it correctly.”

That restraint made the system feel more trustworthy. The fastest way to lose user confidence is to make the agent pretend it can do more than it should.

## What changed in the first six weeks

The first visible win was note quality. Instead of receiving “customer needs service, call back,” the team got structured summaries with urgency, address, callback number, and a plain-language issue description. That alone saved time before the first return call happened.

The second win was after-hours visibility. Calls that previously disappeared into voicemail were now logged with context, and emergency requests could be escalated quickly. Not every answered call became a booked job, but the team finally understood how much demand used to vanish.

The third win was calmer daytime operations. The coordinator no longer had to drop everything every time the phone rang. The shop could handle inbound demand without acting like the phone was an alarm bell.

## Why AI beat the answering service here

The advantage was not that AI was somehow more human than the answering service. The advantage was consistency.

The system asked the same critical questions every time. It followed the same urgency rules every time. It delivered notes in a usable structure every time. For a tiny operator, that kind of consistency is leverage. One missed question can mean an extra callback, a delayed dispatch, or a lost emergency job. Over a month, those small misses add up.

## What we did not automate

To keep the case study honest, we did not automate everything. The system did not fully schedule every appointment end to end. It did not attempt deep equipment diagnosis over the phone. It did not run giant upsell trees. Its job was to answer fast, triage cleanly, and hand the team a better next action.

That scope discipline is a big reason the rollout worked. Small businesses do not need theater. They need practical relief.

## The biggest ROI was part financial, part psychological

By week six, the owner estimated that recovered service revenue from better after-hours coverage had already covered the monthly cost of the system. But the operational benefit was only part of the story. He also described feeling like the business was finally “answering even when I’m not.”

That emotional shift matters more than people admit. Owners carry a constant low-grade stress that the next missed call is lost money or a disappointed customer. Reliable front-desk coverage removes some of that burden.

## Lessons for other home-service operators

If you run HVAC, plumbing, electrical, roofing, or restoration, I would focus on a few basics before automating anything:

- map the top call types you already get
- define urgency based on your actual dispatch economics
- capture the fields that shorten callback time
- keep the greeting short and the escalation path obvious
- measure recovered jobs, not just answer rate

For this shop, replacing the answering service was not mainly about cost cutting. It was about replacing a vague handoff with a dependable first response. For a three-person operation, that change is enormous.`,
  }),
  createPost({
    id: "building-reliable-voice-agents-100000-calls",
    title: "Building Reliable Voice Agents: Lessons from 100,000 Calls",
    date: "2026-03-31T09:00:00.000Z",
    author: "Mike Lorenzo",
    excerpt:
      "At small scale, voice agents fail in obvious ways. At six figures of call volume, they fail in subtler patterns: noisy handoffs, brittle retries, and tone drift that slowly erodes trust. These are the reliability lessons that only show up after enough real conversations go through the system.",
    body: `# Reliability starts where the demo ends

A voice agent can survive ten clean demo calls and still fail badly in production. Real traffic includes background noise, clipped utterances, interruptions, odd phrasing, angry callers, and dependencies that slow down at the worst possible moment. Once you cross enough volume, the question stops being “Can the AI answer?” and becomes “Can it recover gracefully when the call gets messy?”

After roughly 100,000 calls across reception, qualification, scheduling, and follow-up workflows, a few reliability lessons became impossible to ignore. Production stability in voice AI is not about one perfect model choice. It is about how the full system behaves under pressure.

## Most failures are partial failures

Traditional monitoring thinks in binary terms: the service worked or it failed. Customer-facing voice systems break on a spectrum. The transcript may be mostly correct but late. The tool call may succeed after a retry, yet the silence makes the caller think the assistant froze. The answer may be factually fine but so long that the voice sounds unnatural.

That matters because the best fixes usually target “almost failures” before they become visible churn.

The most common patterns we saw were:

- latency spikes that made the assistant sound uncertain
- clarification loops after names, addresses, or dates were misheard
- retries that technically recovered but created dead air
- long responses that degraded voice quality
- routing decisions made on shaky transcript fragments

## Confirmation beats confidence on messy input

One of the easiest mistakes in voice AI is trusting the transcript too much. Models often sound more confident than the input deserves. We saw this with street names, apartment numbers, medication terms, and anything that depends on exact spelling.

We adopted a simple rule: confirm high-cost fields.

- confirm addresses, phone numbers, and appointment times explicitly
- repeat back unusual names or spelled identifiers
- use constrained capture prompts instead of free-form extraction when structure matters
- ask one confirmation question early instead of repairing a bad assumption later

That adds a little friction to some calls, but it prevents much larger workflow failure downstream.

## Retry logic has to protect the conversation

Many teams implement retries as a backend concern. In voice products, the caller lives inside the retry window. They hear the delay. They interpret the silence. Reliability work has to account for that surface experience.

We shifted to bounded, workflow-aware retries. If a lookup was slow, the assistant got one fast retry. If the dependency still lagged, it moved the conversation forward: “I’m checking that now. Let me confirm one detail while I pull it up.” That small change turned waiting into progress.

A caller will tolerate a brief clarification. They will not tolerate a blank pause that feels like the system died.

## Interruption handling is a trust feature

People interrupt when they think they are in a real conversation. They cut in to correct a detail, shorten the path, or stop hearing what they already know. If the agent cannot handle interruption cleanly, the whole interaction starts to feel fake.

We learned to treat interruption handling as a reliability problem, not just a UX polish item. The agent had to:

- stop speaking quickly when the caller jumped in
- preserve the useful context from the interrupted turn
- avoid repeating the exact same sentence after the interruption
- re-anchor with a short acknowledgement instead of resetting the whole flow

With those behaviors in place, callers corrected the agent naturally instead of fighting it.

## Voice quality is operational, not cosmetic

Callers do not separate “voice quality” from “system reliability.” If the cadence is odd, the sentence is too dense, or the tone swings between turns, users experience the system as less dependable.

We improved voice quality mostly by changing the text before it hit synthesis. Shorter clauses, fewer stacked ideas, and less corporate filler made the output easier to render and easier to trust. We also constrained style by workflow. An urgent service call should not sound reflective. A simple appointment confirmation should not sound overly formal.

The best production voices were the ones customers stopped noticing.

## Classify failures or you will chase the wrong ones

“Failure rate” is too blunt once call volume grows. We got better results by splitting reliability issues into clear classes:

- speech input problems: noise, echo, clipped utterances, speakerphone artifacts
- reasoning problems: wrong intent, overlong answer, tool misuse
- voice output problems: delayed playback, unnatural pacing, interruption lag
- integration problems: CRM timeout, calendar conflict, stale knowledge snapshot
- workflow problems: missed escalation, skipped confirmation, wrong disposition

That taxonomy made prioritization far more honest. A small issue in address capture can matter more than a bigger issue in a low-stakes FAQ branch.

## Observability must follow the full turn

Aggregate call outcomes hide too much. We instrumented the conversation turn by turn: endpoint timing, transcript finalization, first model token, first audio byte, tool latency, retry count, and final disposition. That let us spot patterns that customers felt before support tickets appeared.

For example, a modest tool slowdown did not trip a major API alarm, but it produced a noticeable dip in booking-flow responsiveness. Another voice preset sounded great in testing but degraded on longer responses. Turn-level traces made both problems visible early.

## The best fallback narrows the next step

When the system gets uncertain, the wrong instinct is often to over-explain. The better move is to narrow the next action.

- confirm one critical detail
- take a clean message for human follow-up
- offer the next available action without overcommitting
- route with a useful summary already captured

Competent humans do this naturally. They do not bluff. They reduce uncertainty and keep the interaction moving.

## The practical checklist we use now

If I had to reduce 100,000 calls to one checklist, it would be this:

- confirm high-cost fields instead of trusting raw transcript confidence
- design retries around caller experience, not just backend resilience
- optimize interruption handling so callers can correct the system naturally
- constrain voice style for clarity and consistency
- instrument each stage of the turn so “almost failures” are visible
- build narrow, honest fallbacks that preserve momentum

Reliable voice agents are not the ones that never encounter trouble. They are the ones that recover without making the caller carry the burden. That is the standard that matters in production.`,
  }),
  createPost({
    id: "real-cost-of-missed-calls-ai-receptionists",
    title: "The Real Cost of Missed Calls: Why SMBs Are Moving to AI Receptionists",
    date: "2026-02-19T09:00:00.000Z",
    author: "Mike Lorenzo",
    excerpt:
      "For many SMBs, the missed-call problem is not a branding issue; it is a compounding revenue leak that touches lead conversion, labor efficiency, and customer retention. This analysis looks at missed-call economics through an operator lens and explains why AI receptionists are becoming a practical upgrade instead of a futuristic experiment.",
    body: `# Missed calls are not a nuisance. They are a revenue system problem.

Ask a small-business owner how many calls they miss in a week and you often get a shrug. Ask how many jobs, consultations, or repeat customers those missed calls represent and the conversation gets more uncomfortable. Most SMBs do not have a clean model for the economics of unanswered demand. They know the phone rings at bad times. They know voicemail is unreliable. They know staffing a full-time receptionist is expensive. What they often lack is a simple way to see how those small misses compound.

That is a major reason AI receptionists are getting real traction now. Not because owners suddenly want novelty, but because the cost of weak call coverage is becoming harder to ignore.

## The first accounting mistake is only comparing labor line items

Many businesses evaluate front-desk options by comparing salary, answering-service fees, or software subscriptions. That framing misses the biggest variable: response coverage.

A phone system creates value in three ways:

- it captures new demand that would otherwise bounce to a competitor
- it protects existing relationships by reducing wait and friction
- it shields owners and core staff from constant interruption

A missed call weakens all three at once. The cost is not just that nobody answered. It is lost conversion, weaker retention, and scattered labor.

## Inbound calls are usually high-intent moments

A website visitor can be casually browsing. A caller is often further down the decision path. They already have a need, a short list of options, and a reason to act now. That makes missed calls more expensive than many operators realize.

If even a handful of high-intent calls each month fail to connect with a real workflow, the lost revenue can exceed the cost of better coverage. This shows up in home services, legal intake, med spas, restoration, property management, and any business where immediacy influences conversion.

The customer rarely retries forever. They call the next number, send a text somewhere else, or postpone the decision entirely.

## Voicemail is not neutral

Voicemail feels like a reasonable fallback because it is better than nothing. In practice, it is a conversion discount.

Some callers never leave one. Some leave incomplete details. Some leave a useful message, but by the time the callback happens they have already moved on. There is also a subtle user-experience cost: voicemail transfers work to the customer. They have to decide what information matters, explain it clearly, and trust that someone will respond quickly.

Live answering, even when partially automated, changes that dynamic by turning uncertainty into forward motion.

## Why staffing alone does not solve the problem

Hiring a great receptionist can absolutely improve operations. The issue is that many SMBs do not have smooth, predictable call volume. Their pain shows up during lunch, evenings, weekends, in-field interruptions, or those exact moments when the one person who usually answers is unavailable.

That creates a structural mismatch. Customer expectation is constant. Small-business staffing is not. AI receptionists fit that mismatch well because they provide always-on coverage without forcing every business to staff like a mini call center.

## What owners actually want from AI reception

Most owners are not looking for a robot that does everything. They want a dependable first response that handles a few jobs exceptionally well:

- answer immediately
- sound professional and on-brand
- capture the right information the first time
- separate urgent from non-urgent inquiries
- route or summarize the next step cleanly

That is why the strongest ROI cases rarely come from novelty. They come from consistency and throughput.

## The ROI usually shows up in four buckets

When businesses model AI reception honestly, the return tends to appear in four places:

- recovered leads: fewer opportunities die in voicemail or missed-call windows
- better staff utilization: office staff spend less time triaging repetitive calls
- faster response time: customers get acknowledged immediately
- cleaner operations: notes and follow-ups become structured instead of living in memory

These gains reinforce one another. Cleaner intake improves speed. Faster speed improves conversion. Better conversion makes the staffing equation easier.

## The pattern repeats across industries

Different verticals feel the pain differently, but the economics rhyme.

- Home services lose urgent jobs to whoever answers first.
- Legal teams lose consults when intake is slow or vague.
- Clinics and med spas lose bookings when the desk is overloaded.
- Property managers lose leads when leasing questions sit unanswered.
- Agencies and B2B firms lose momentum when one busy operator bottlenecks inbound qualification.

The common denominator is simple: response coverage affects revenue more directly than most SMBs measure.

## Why adoption is accelerating now

Three things changed. First, voice quality improved enough that AI receptionists stopped sounding like obvious IVR trees. Second, the orchestration layer matured, which means these systems can connect to calendars, CRMs, messaging, and business knowledge in practical ways. Third, owners have become more open to augmentation because labor remains tight and after-hours responsiveness matters more than ever.

The category moved from “interesting experiment” to “credible operating tool.”

## What buyers should test before they commit

Not every AI receptionist product is worth deploying. Owners should ask a few practical questions:

- How fast does it answer, and does it sound natural live?
- Can it handle interruption and clarification cleanly?
- Does it capture structured notes instead of only raw transcripts?
- Can it escalate urgent issues based on the business’s real logic?
- What happens when the system is uncertain or an integration is slow?

A good product reduces operational risk. A weak one just turns voicemail into a prettier interface.

## The strategic shift behind the market

For years, reception was treated as overhead. That framing encouraged businesses to minimize it until it broke. AI is changing that by making front-desk coverage look more like a revenue system. Owners are realizing that answering quickly and consistently is not administrative polish. It is demand capture.

That is why the best AI receptionist deployments are not positioned as “replace your staff.” They are positioned as “stop leaking the calls you already paid to earn.” That message resonates because it is economically true.

## The bottom line

If your business depends on inbound calls, every missed call has a real expected cost even if it never appears on your P&L as a neat line item. SMBs are moving to AI receptionists because the alternative is not simply “handle it manually.” The alternative is tolerating preventable revenue leakage.

That is the real story behind the category: better coverage, better follow-through, and a front desk that is finally available when the business needs it most.`,
  }),
].sort((a, b) => b.date.localeCompare(a.date));

export function getBlogPostBySlug(slug: string) {
  return BLOG_POSTS.find((post) => post.id === slug);
}
