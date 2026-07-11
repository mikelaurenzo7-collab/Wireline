# Wireline Visual Operating Pack — July 2026

Status: **Active** · Created 2026-07-11 · Companion board: [Wireline Launch Command Center (Miro)](https://miro.com/app/board/uXjVH82__SM=/)

This pack turns the current launch doctrine into shareable visuals for planning, content, and marketing. Every diagram below was validated and rendered through the Mermaid Chart connector; the same system lives on the Miro board for collaborative planning. Sources of truth: [WIRELINE_FORWARD_PLAN_2026-07.md](./WIRELINE_FORWARD_PLAN_2026-07.md), [WIRELINE_CEO_LAUNCH_CHECKLIST_2026-07-10.md](./WIRELINE_CEO_LAUNCH_CHECKLIST_2026-07-10.md), [ONE-AGENT-STRATEGY.md](./ONE-AGENT-STRATEGY.md), [LAUNCH_OPERATING_SYSTEM.md](./LAUNCH_OPERATING_SYSTEM.md), [WIRELINE_2026_ROADMAP.md](./WIRELINE_2026_ROADMAP.md).

## How to use this pack

| Diagram | Use it for |
| --- | --- |
| 1. Product loop | Landing/pitch explainers, onboarding docs, investor one-pagers |
| 2. Activation funnel | Weekly funnel review; deciding what to ship against friction |
| 3. Horizon roadmap | Planning; sequencing; saying no to non-Horizon-0 work |
| 4. Customer journey | Marketing copy, ad angles, onboarding empathy checks |
| 5. Competitive quadrant | Pricing/comparison pages, sales conversations |
| 6. Content engine flywheel | Content strategy; keeping content tied to real proof |
| 7. GTM channel map | Channel prioritization and marketing planning |

## 1. Product loop

The core explainer: one trained AI employee, one loop, outcomes feed retraining.

```mermaid
flowchart LR
    A["Create<br/>Spin up one focused AI employee"] --> B["Train<br/>Facts, sources, policies, tone, tools"]
    B --> C["Wire<br/>Included number, integrations, routing, approvals"]
    C --> D["Run<br/>Studio: calls, texts, follow-up, review"]
    D -- "Outcomes feed retraining" --> B
    D -- "Proof: booked, revived, recovered" --> E(["Wire it. It works. You win."])
    style A fill:#1e1b2e,stroke:#A78BFA,color:#F5F4F8
    style B fill:#1e1b2e,stroke:#A78BFA,color:#F5F4F8
    style C fill:#1e1b2e,stroke:#A78BFA,color:#F5F4F8
    style D fill:#1e1b2e,stroke:#A78BFA,color:#F5F4F8
    style E fill:#A78BFA,stroke:#C7CCD6,color:#0A0A0E
```

## 2. Activation funnel

Horizon 0 lives or dies on this funnel. The two dotted gates are the numbers that matter.

```mermaid
flowchart TD
    V["Visitor lands on trywireline.com<br/>Promise: the best employee you have ever had"] --> S["Signup"]
    S --> C["Create<br/>name, voice, personality, operating brief"]
    C --> T["Train<br/>brief becomes rules, facts, tone, handoffs"]
    T --> W["Wire<br/>included number + integrations + approvals"]
    W --> F["First live test call completed"]
    F --> P["Paid conversion<br/>Starter $9 / Starter Plus $19 / Pro $59 / Business $149"]
    P --> X["Expansion<br/>extra live agent add-on $15 = +1 agent, +1 number, +50 min"]

    F -. "North-star gate: 70% of signups<br/>reach this within 5 minutes" .-> G(["Activation"])
    P -. "Horizon 0 exit: first paid<br/>conversion proven end to end" .-> H(["Sell today"])

    style V fill:#1e1b2e,stroke:#A78BFA,color:#F5F4F8
    style F fill:#A78BFA,stroke:#C7CCD6,color:#0A0A0E
    style P fill:#A78BFA,stroke:#C7CCD6,color:#0A0A0E
    style G fill:#0A0A0E,stroke:#C7CCD6,color:#F5F4F8
    style H fill:#0A0A0E,stroke:#C7CCD6,color:#F5F4F8
```

## 3. Horizon roadmap

Dates are working targets anchored to the forward plan's week ranges (Horizon 1 = weeks 4–10, Horizon 2 = weeks 10–18, Horizon 3 = weeks 18+ from 2026-07-11).

```mermaid
gantt
    title Wireline 2026 Horizon Roadmap
    dateFormat YYYY-MM-DD
    axisFormat %b %d
    section Horizon 0 - Sell today
    Activation E2E proof on production          :crit, active, h0a, 2026-07-11, 7d
    Federal DNC vendor credentials in Vercel    :crit, h0b, 2026-07-11, 5d
    Upstash Redis confirmed in production       :h0c, 2026-07-14, 3d
    First paid conversion proven                :milestone, m0, 2026-07-18, 0d
    section Horizon 1 - Use-case excellence
    Federal DNC vendor live                     :h1a, 2026-08-08, 14d
    Outbound analytics UI                       :h1b, 2026-08-08, 21d
    Learning loop GA                            :h1c, 2026-08-22, 21d
    Broad GTM push                              :h1d, 2026-08-15, 28d
    section Horizon 2 - Distribution
    Browser extension store launches            :h2a, 2026-09-19, 21d
    iOS and Android store parity                :h2b, 2026-09-19, 35d
    ChatGPT App GA                              :h2c, 2026-10-03, 21d
    section Horizon 3 - Leadership
    SSO and enterprise readiness                :h3a, 2026-11-13, 30d
    Live supervisor audio                       :h3b, 2026-11-13, 30d
    SDK, marketplace, ERP connectors            :h3c, 2026-12-01, 45d
```

## 4. Customer journey

The emotional arc marketing copy should mirror: pain → relief → proof → expansion.

```mermaid
journey
    title Owner journey to a working best employee
    section Discover
      Misses another customer call: 2: Owner
      Sees the best employee promise: 4: Owner
    section Try
      Signs up and writes the operating brief: 5: Owner
      Watches Training turn the brief into rules: 5: Owner
    section Activate
      Wires the included number: 4: Owner
      Hears the first live test call: 5: Owner
    section Pay and grow
      Upgrades to a paid plan: 4: Owner
      Adds an extra agent for a new line: 5: Owner
      Reviews outcomes weekly in Studio: 5: Owner
```

## 5. Competitive positioning

From the positioning matrix in [WIRELINE_2026_ROADMAP.md](./WIRELINE_2026_ROADMAP.md): no major competitor blends live conversational voice with an on-screen presenter in one self-serve operator console.

```mermaid
quadrantChart
    title Voice AI landscape - July 2026
    x-axis Sales-led --> Self-serve
    y-axis Audio only --> Voice plus live presenter
    quadrant-1 Wireline territory
    quadrant-2 Rendered video only
    quadrant-3 Sales-led infrastructure
    quadrant-4 Self-serve voice
    Wireline: [0.86, 0.88]
    Retell: [0.72, 0.18]
    Vapi: [0.4, 0.15]
    Synthflow: [0.75, 0.22]
    Bland: [0.18, 0.2]
    Synthesia: [0.62, 0.6]
    HeyGen: [0.68, 0.55]
```

## 6. Content engine flywheel

Content stays honest because it starts from real agent outcomes, and every published piece routes back to activation.

```mermaid
flowchart LR
    A["Real agent outcomes<br/>booked, revived, answered, recovered"] --> B["Proof assets<br/>call clips, before-and-after stats, transcripts"]
    B --> C{"Content pillars"}
    C --> D["Best-employee stories"]
    C --> E["Build in public"]
    C --> F["Vertical playbooks"]
    C --> G["Trust and compliance proof"]
    D --> H["Social channels<br/>X, LinkedIn, TikTok, YouTube Shorts"]
    E --> H
    F --> I["SEO surfaces<br/>vertical pages, comparison pages, Trust Center"]
    G --> I
    H --> J["trywireline.com landing"]
    I --> J
    J --> K["Signup to first call in 5 minutes"]
    K --> A
    style A fill:#A78BFA,stroke:#C7CCD6,color:#0A0A0E
    style K fill:#A78BFA,stroke:#C7CCD6,color:#0A0A0E
```

## 7. GTM channel map

```mermaid
mindmap
  root((Wireline GTM))
    Owned surfaces
      Landing hero with best employee promise
      Pricing page with comparison table
      Trust Center
      Vertical proof pages
    Product-led growth
      Free create and train
      First call in 5 minutes
      Referral loop
      ChatGPT App listing
    Content engine
      Call recording clips
      Before and after stats
      Build in public founder posts
      Vertical playbooks
    Distribution beachheads
      Local service niches first
      Agency partners
      Extension stores
      Mobile app stores
```

## Miro Launch Command Center

Collaborative counterpart to this pack: **[Wireline Launch Command Center](https://miro.com/app/board/uXjVH82__SM=/)**.

| Frame | Contents |
| --- | --- |
| 1 · North Star & Positioning | Category, promise, secondary copy, audiences, banned framings, pricing ladder, activation goal |
| 2 · Horizon Roadmap 2026 | Horizon 0–3 phase cards with per-horizon workstream stickies and the Horizon 0 exit gate |
| 3 · Activation Funnel | Eight-step funnel with the 70%/5-minute and first-paid-conversion gates |
| 4 · Content Engine Flywheel | Outcomes → proof → publish → landing → activation cycle with the four content pillars |
| 5 · 30-Day Content Calendar | 14 launch-window content pieces with week, pillar, channel, CTA, and status columns |
| 6 · Marketing Channel Plan | Nine channels with motion, cadence, KPI, and Live/Ramp/Next status |
| 7 · Weekly Operating Cadence | Monday–Friday operating rhythm plus always-on compliance rules |

## Maintenance

- Update the Gantt dates when a horizon gate is passed; the forward plan's week ranges are the source of truth.
- Keep pricing figures in sync with [WIRELINE_CEO_LAUNCH_CHECKLIST_2026-07-10.md](./WIRELINE_CEO_LAUNCH_CHECKLIST_2026-07-10.md) and `src/lib/plan-catalog.ts`.
- The content calendar and channel plan on the Miro board are working surfaces — edit them there; this doc only records the system.
- Marketing rules still apply everywhere: truthful proof only, no vendor names on customer surfaces, no CEO-first language.
