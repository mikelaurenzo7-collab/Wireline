import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, Loader2, PhoneCall, Sparkles } from "lucide-react";
import { authFetch, safeJson } from "../lib/api";
import { useBodyScrollLock } from "../lib/use-body-scroll-lock";
import { useModalFocusTrap } from "../lib/use-modal-focus-trap";
import {
  AGENT_DIRECTION_GUIDANCE,
  GUIDED_AGENT_LEARNING_LOOP,
  type AgentDirection,
  scoreCallPlanReadiness,
} from "../lib/guided-agent-learning";

export type PhoneAgentFlowStep = {
  id: string;
  name: string;
  instructions: string;
  transitionCondition: string;
  isEndNode?: boolean;
};

type BlueprintKind =
  | "personal"
  | "support"
  | "call-center"
  | "home-services"
  | "medical"
  | "legal"
  | "real-estate"
  | "insurance"
  | "restaurant"
  | "sales"
  | "custom";
type Tone = "warm" | "concise" | "polished" | "calm" | "upbeat";

type BlueprintDraft = {
  kind: BlueprintKind;
  direction: AgentDirection;
  tone: Tone;
  purpose: string;
  caller: string;
  outcome: string;
  handoff: string;
  boundaries: string;
};

type PhoneAgentBlueprintProps = {
  agentId?: string;
  agentName?: string;
  existingSteps?: PhoneAgentFlowStep[] | null;
  disabled?: boolean;
  onSaved?: () => void;
};

const directionOrder: AgentDirection[] = ["outbound", "inbound", "hybrid"];

const blueprints: Array<{
  value: BlueprintKind;
  label: string;
  detail: string;
  direction: AgentDirection;
  recommended?: boolean;
  defaults: Omit<BlueprintDraft, "kind" | "tone" | "direction">;
}> = [
  {
    value: "sales",
    label: "Sales and qualification",
    detail: "Speed-to-lead, governed follow-up, and booked next steps.",
    direction: "outbound",
    recommended: true,
    defaults: {
      purpose:
        "Qualify speed-to-lead and warm follow-up interest, then schedule the right next conversation.",
      caller:
        "Inbound demo requests, missed callbacks, quote follow-ups, and approved first-party lead lists.",
      outcome:
        "Understand the need, capture qualified details, answer approved questions, and book a clear next step.",
      handoff:
        "Escalate pricing exceptions, contract questions, enterprise requests, and frustrated prospects to a human owner.",
      boundaries:
        "Never pressure callers, make unapproved discounts, promise implementation dates, or claim features that are not confirmed.",
    },
  },
  {
    value: "personal",
    label: "Personal agent",
    detail: "Routine calls, appointments, follow-through.",
    direction: "hybrid",
    defaults: {
      purpose: "Handle routine personal calls and approved follow-up requests.",
      caller: "People calling for the account owner, providers, and businesses.",
      outcome:
        "Capture the request, schedule the next step when authorized, and send a clear recap.",
      handoff: "Escalate private, urgent, financial, or sensitive matters to the account owner.",
      boundaries:
        "Never share private information, make financial commitments, or impersonate the account owner.",
    },
  },
  {
    value: "support",
    label: "Support desk",
    detail: "FAQs, account help, escalation, and follow-up.",
    direction: "inbound",
    defaults: {
      purpose:
        "Answer support calls, verify context, resolve approved questions, and route anything account-specific or urgent.",
      caller: "Customers, account contacts, partners, and people asking for help.",
      outcome:
        "Understand the issue, answer from approved knowledge when possible, create a clear next step, and send a concise recap.",
      handoff:
        "Escalate billing disputes, security-sensitive requests, angry callers, outages, and anything outside approved policy.",
      boundaries:
        "Never expose private account data, invent policy, promise refunds, or claim a fix that has not been confirmed.",
    },
  },
  {
    value: "call-center",
    label: "Call center / overflow",
    detail: "Queue coverage, triage, routing, and recaps.",
    direction: "inbound",
    defaults: {
      purpose:
        "Cover live call volume, classify caller intent, route to the right owner, and preserve a clean transcript and outcome.",
      caller:
        "Customers, prospects, vendors, partners, and internal stakeholders who reach the shared line.",
      outcome:
        "Identify the caller, classify urgency and reason, resolve approved requests, route complex work, and log the outcome.",
      handoff:
        "Escalate VIPs, urgent operational issues, compliance-sensitive requests, and callers who need a human decision.",
      boundaries:
        "Never let a caller believe they reached a human queue when no human is available; never promise unapproved timelines or outcomes.",
    },
  },
  {
    value: "home-services",
    label: "Home services",
    detail: "HVAC, plumbing, electrical, landscaping, and more.",
    direction: "inbound",
    defaults: {
      purpose:
        "Answer inbound service calls, qualify the issue, and help the team respond quickly.",
      caller: "Homeowners and property managers asking for service, estimates, or updates.",
      outcome:
        "Capture name, callback number, address, service need, and urgency; book or route the next step.",
      handoff:
        "Immediately flag safety issues, active leaks, loss of heat or cooling in extreme weather, and frustrated callers.",
      boundaries:
        "Never diagnose, promise arrival times, quote unapproved prices, or guarantee repair outcomes.",
    },
  },
  {
    value: "medical",
    label: "Medical office",
    detail: "Appointments, routine questions, and safe routing.",
    direction: "inbound",
    defaults: {
      purpose: "Handle non-clinical calls, scheduling requests, and routine office information.",
      caller: "Patients, caregivers, pharmacies, and referring offices.",
      outcome:
        "Verify the basic reason for the call, collect a safe callback method, and route or schedule according to office policy.",
      handoff:
        "Urgently route time-sensitive clinical concerns to the approved human team; instruct callers with emergencies to use local emergency services.",
      boundaries:
        "Never diagnose, give clinical advice, interpret results, promise coverage, or disclose protected information without approved verification.",
    },
  },
  {
    value: "legal",
    label: "Legal intake",
    detail: "New inquiries, scheduling, and respectful routing.",
    direction: "inbound",
    defaults: {
      purpose: "Handle new inquiry and scheduling calls with a professional intake experience.",
      caller: "Potential clients, current clients, courts, opposing offices, and vendors.",
      outcome:
        "Capture contact details, matter category, urgency, and preferred next step; book a consultation when allowed.",
      handoff:
        "Route deadlines, active hearings, urgent safety matters, and conflict-sensitive requests to the firm immediately.",
      boundaries:
        "Never give legal advice, form an attorney-client relationship, promise an outcome, or confirm representation.",
    },
  },
  {
    value: "real-estate",
    label: "Real estate",
    detail: "Buyer, seller, showing, and inquiry follow-up.",
    direction: "hybrid",
    defaults: {
      purpose: "Handle property inquiries, showing requests, and approved follow-up calls.",
      caller: "Buyers, sellers, renters, referral partners, and vendors.",
      outcome:
        "Capture contact details, property interest, timeline, and preferred appointment; create a clear next step.",
      handoff:
        "Route active offers, urgent transaction questions, and requests for a licensed professional promptly.",
      boundaries:
        "Never promise pricing, availability, financing, commission terms, or legal outcomes.",
    },
  },
  {
    value: "insurance",
    label: "Insurance office",
    detail: "Service requests, intake, and safe escalation.",
    direction: "hybrid",
    defaults: {
      purpose:
        "Handle policy-service calls, new inquiries, and approved follow-up while keeping coverage decisions with licensed staff.",
      caller:
        "Policyholders, prospective customers, carriers, repair shops, and referral partners.",
      outcome:
        "Identify the request, capture contact details and policy context when appropriate, then route or schedule a licensed follow-up.",
      handoff:
        "Escalate claims, cancellations, binding requests, coverage changes, complaints, and urgent loss reports to the approved team.",
      boundaries:
        "Never bind coverage, quote final terms, interpret coverage, advise on claims, or make coverage guarantees.",
    },
  },
  {
    value: "restaurant",
    label: "Restaurant or hospitality",
    detail: "Reservations, hours, events, and guest service.",
    direction: "inbound",
    defaults: {
      purpose:
        "Handle reservations, guest questions, private-event inquiries, and routine service calls.",
      caller: "Guests, vendors, delivery partners, and event planners.",
      outcome:
        "Confirm the request, collect party details or contact information, and book or route the next step.",
      handoff:
        "Escalate accessibility concerns, large events, complaints, and manager requests promptly.",
      boundaries:
        "Never guarantee table availability, allergy safety, menu pricing, delivery timing, or special accommodations without confirmation.",
    },
  },
  {
    value: "custom",
    label: "Custom workflow",
    detail: "A blank but structured phone-agent plan.",
    direction: "inbound",
    defaults: {
      purpose: "Describe the job this phone agent owns.",
      caller: "Describe who calls this agent or which approved list it calls.",
      outcome: "Describe the completed result you want from a successful call.",
      handoff: "Describe exactly when a person should take over.",
      boundaries: "Describe promises this agent must never make.",
    },
  },
];

const tones: Array<{ value: Tone; label: string; detail: string }> = [
  { value: "warm", label: "Warm", detail: "Human and reassuring" },
  { value: "concise", label: "Concise", detail: "Fast and direct" },
  { value: "polished", label: "Polished", detail: "Professional and composed" },
  { value: "calm", label: "Calm", detail: "Steady under pressure" },
  { value: "upbeat", label: "Upbeat", detail: "Positive, never pushy" },
];

function getBlueprint(kind: BlueprintKind) {
  return blueprints.find((blueprint) => blueprint.value === kind) ?? blueprints[0];
}

function createDraft(kind: BlueprintKind = "sales"): BlueprintDraft {
  const blueprint = getBlueprint(kind);
  return { kind, direction: blueprint.direction, tone: "warm", ...blueprint.defaults };
}

function safeMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const value = payload as Record<string, unknown>;
  return typeof value.error === "string" ? value.error : fallback;
}

function buildFlow(agentName: string, draft: BlueprintDraft): PhoneAgentFlowStep[] {
  const tone = tones.find((item) => item.value === draft.tone)?.label.toLowerCase() ?? "warm";
  const direction = AGENT_DIRECTION_GUIDANCE[draft.direction];
  const prefix = agentName || "This agent";
  const stamp = `${Date.now()}`;

  return [
    {
      id: `blueprint-${stamp}-welcome`,
      name: "Welcome and orient",
      instructions: `Answer as ${prefix}. Use a ${tone}, natural, and efficient tone. This is a ${direction.label.toLowerCase()} call agent: ${direction.plainEnglish} Clearly identify the business or person you represent when appropriate. The agent's job is: ${draft.purpose}`,
      transitionCondition:
        "The caller knows they reached the right place and has stated what they need.",
    },
    {
      id: `blueprint-${stamp}-understand`,
      name: "Understand the request",
      instructions: `Follow this call direction loop: ${direction.loop.join(" -> ")}. These callers or lists are typically: ${draft.caller} Ask only the questions needed to understand the request. Confirm the important details back in plain language before moving forward.`,
      transitionCondition:
        "You have enough accurate context to take the approved next action or hand the request off.",
    },
    {
      id: `blueprint-${stamp}-resolve`,
      name: "Resolve or route",
      instructions: `A successful call should lead to: ${draft.outcome} When a human is needed: ${draft.handoff}`,
      transitionCondition:
        "The approved next action is complete, a human handoff is initiated, or a clear callback path is recorded.",
    },
    {
      id: `blueprint-${stamp}-recap`,
      name: "Recap and close",
      instructions: `Close with a short recap of what will happen next. Always follow these boundaries: ${draft.boundaries} Do not invent answers. If the correct answer is unavailable, say what will happen next and capture the best way to follow up.`,
      transitionCondition: "",
      isEndNode: true,
    },
  ];
}

export default function PhoneAgentBlueprint({
  agentId,
  agentName,
  existingSteps,
  disabled = false,
  onSaved,
}: PhoneAgentBlueprintProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<BlueprintDraft>(createDraft());
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const dialogRef = useRef<HTMLElement>(null);

  function closeDialog() {
    if (saving) return;
    setIsOpen(false);
  }

  useBodyScrollLock(isOpen);
  useModalFocusTrap(dialogRef, {
    active: isOpen,
    onEscape: closeDialog,
  });

  const stageCount = Array.isArray(existingSteps) ? existingSteps.length : 0;
  const isReplacing = stageCount > 0;
  const selectedBlueprint = useMemo(() => getBlueprint(draft.kind), [draft.kind]);
  const directionGuidance = AGENT_DIRECTION_GUIDANCE[draft.direction];
  const readiness = useMemo(() => scoreCallPlanReadiness(draft), [draft]);
  const readyCount = readiness.filter((item) => item.ready).length;
  const isReady = readyCount === readiness.length;
  const savedStageNames = useMemo(
    () =>
      (existingSteps ?? [])
        .map((step, index) => step.name?.trim() || `Stage ${index + 1}`)
        .slice(0, 4),
    [existingSteps],
  );

  useEffect(() => {
    if (!isOpen) return;
    setDraft(createDraft());
    setNotice("");
  }, [agentId, isOpen]);

  function chooseBlueprint(kind: BlueprintKind) {
    const blueprint = getBlueprint(kind);
    setDraft((current) => ({
      ...current,
      kind,
      direction: blueprint.direction,
      ...blueprint.defaults,
    }));
  }

  async function savePlan() {
    if (!agentId || saving || !isReady) return;
    setSaving(true);
    setNotice("");
    try {
      const response = await authFetch(`/api/agent-config/${encodeURIComponent(agentId)}/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "flow", content: buildFlow(agentName || "Wireline", draft) }),
      });
      const payload = await safeJson(response);
      if (!response.ok) throw new Error(safeMessage(payload, "We could not save this call plan."));
      setNotice("Saved. Your agent now has a clear call path.");
      onSaved?.();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "We could not save this call plan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className="studio-card studio-blueprint-card">
        <div className="studio-card-heading">
          <div>
            <p className="studio-kicker">Phone behavior</p>
            <h2>Call plan</h2>
          </div>
          {stageCount > 0 ? (
            <span className="studio-count">{stageCount}</span>
          ) : (
            <PhoneCall size={17} aria-hidden="true" />
          )}
        </div>
        <p className="studio-muted-copy">
          {isReplacing
            ? "A saved call path is active. Replace it only when the call job, direction, or handoff rules change."
            : "Choose the call direction, teach the job, and check launch readiness before the first live call."}
        </p>
        {isReplacing && savedStageNames.length > 0 && (
          <p
            className="mb-3 truncate border-t border-border pt-3 text-[length:var(--wireline-typography-overline-size)] font-medium leading-4 text-muted-foreground"
            title={savedStageNames.join(" → ")}
          >
            {savedStageNames.join(" → ")}
          </p>
        )}
        <button
          className="studio-blueprint-trigger"
          type="button"
          disabled={!agentId || disabled}
          onClick={() => setIsOpen(true)}
        >
          <span>{isReplacing ? "Review or replace call plan" : "Build guided call plan"}</span>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </section>

      {isOpen && (
        <div className="studio-blueprint-backdrop" role="presentation" onMouseDown={closeDialog}>
          <section
            ref={dialogRef}
            className="studio-blueprint-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="phone-agent-blueprint-title"
            aria-describedby="phone-agent-blueprint-description"
            aria-busy={saving}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="studio-blueprint-heading">
              <div>
                <p className="studio-kicker">Guided call plan</p>
                <h2 id="phone-agent-blueprint-title" data-slot="dialog-title">
                  Teach <span className="wl-preserve-case">{agentName || "this agent"}</span> the
                  call job.
                </h2>
                <p id="phone-agent-blueprint-description">
                  Choose direction first, tune the work, then pass the readiness check. This saves a
                  real staged call plan.
                </p>
              </div>
              <button
                className="studio-blueprint-close"
                type="button"
                onClick={closeDialog}
                disabled={saving}
                aria-label="Close call plan"
              >
                ×
              </button>
            </div>

            <div className="studio-blueprint-learning" aria-label="Guided setup method">
              {GUIDED_AGENT_LEARNING_LOOP.map((item) => (
                <div key={item.step}>
                  <strong>{item.step}</strong>
                  <span>{item.promise}</span>
                </div>
              ))}
            </div>

            <div className="studio-blueprint-section-label">
              <span>1. Direction</span>
              <small>{directionGuidance.plainEnglish}</small>
            </div>
            <div className="studio-blueprint-directions" aria-label="Call direction">
              {directionOrder.map((directionKey) => {
                const direction = AGENT_DIRECTION_GUIDANCE[directionKey];
                return (
                  <button
                    className={draft.direction === directionKey ? "is-selected" : ""}
                    type="button"
                    key={directionKey}
                    onClick={() => setDraft((current) => ({ ...current, direction: directionKey }))}
                  >
                    <strong>{direction.label}</strong>
                    <span>{direction.shortLabel}</span>
                    <small>{direction.loop.join(" → ")}</small>
                  </button>
                );
              })}
            </div>
            <p className="studio-blueprint-teachback">{directionGuidance.proofQuestion}</p>

            <div className="studio-blueprint-section-label">
              <span>2. Use case</span>
              <small>Templates fill the blanks; you can still edit every field.</small>
            </div>
            <div className="studio-blueprint-templates" aria-label="Use case">
              {blueprints.map((blueprint) => (
                <button
                  className={draft.kind === blueprint.value ? "is-selected" : ""}
                  type="button"
                  key={blueprint.value}
                  onClick={() => chooseBlueprint(blueprint.value)}
                >
                  <strong>
                    {blueprint.label}
                    {blueprint.recommended ? (
                      <span className="studio-blueprint-recommended">Recommended</span>
                    ) : null}
                  </strong>
                  <small>{blueprint.detail}</small>
                </button>
              ))}
            </div>

            <div className="studio-blueprint-form">
              <label>
                <span>Call style</span>
                <select
                  value={draft.tone}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, tone: event.target.value as Tone }))
                  }
                >
                  {tones.map((tone) => (
                    <option key={tone.value} value={tone.value}>
                      {tone.label} — {tone.detail}
                    </option>
                  ))}
                </select>
              </label>
              <div className="studio-blueprint-selected">
                <Sparkles size={15} />
                <span>{selectedBlueprint.label} plan</span>
              </div>
              <label className="is-wide">
                <span>What does this agent own?</span>
                <textarea
                  rows={3}
                  value={draft.purpose}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, purpose: event.target.value }))
                  }
                />
              </label>
              <label>
                <span>Who calls or gets called?</span>
                <textarea
                  rows={4}
                  value={draft.caller}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, caller: event.target.value }))
                  }
                />
              </label>
              <label>
                <span>What does a good result look like?</span>
                <textarea
                  rows={4}
                  value={draft.outcome}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, outcome: event.target.value }))
                  }
                />
              </label>
              <label>
                <span>When should a person take over?</span>
                <textarea
                  rows={4}
                  value={draft.handoff}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, handoff: event.target.value }))
                  }
                />
              </label>
              <label>
                <span>What must it never do?</span>
                <textarea
                  rows={4}
                  value={draft.boundaries}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, boundaries: event.target.value }))
                  }
                />
              </label>
            </div>

            <div className="studio-blueprint-preview">
              <span>
                {isReplacing
                  ? "The current plan will be replaced with:"
                  : "It will save four stages:"}
              </span>
              <strong>
                {directionGuidance.loop.join(" → ")} · Welcome → Understand → Resolve or route →
                Recap
              </strong>
            </div>

            <div className="studio-blueprint-readiness" aria-label="Launch readiness">
              <div>
                <strong>Readiness</strong>
                <span>
                  {readyCount}/{readiness.length} clear
                </span>
              </div>
              <ul>
                {readiness.map((item) => (
                  <li key={item.id} className={item.ready ? "is-ready" : ""}>
                    <Check size={13} aria-hidden="true" />
                    {item.label}
                  </li>
                ))}
              </ul>
            </div>

            {notice && (
              <p
                className={`studio-blueprint-notice ${notice.startsWith("Saved") ? "is-success" : ""}`}
              >
                {notice}
              </p>
            )}
            <div className="studio-modal-actions">
              <button
                className="studio-secondary-button"
                type="button"
                onClick={closeDialog}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className="studio-primary-button"
                type="button"
                disabled={saving || !isReady}
                onClick={() => void savePlan()}
              >
                {saving ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
                {isReplacing ? "Replace call plan" : "Save call plan"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
