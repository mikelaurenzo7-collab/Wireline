import React, { useState } from "react";
import { PlayCircle, CheckCircle2, XCircle, Loader2, Plus } from "lucide-react";
import { authFetch } from "../lib/api";
import { clientLog } from "../lib/client-log";
import { ShadButton } from "./ui/shadcn/ShadButton";

type Scenario = {
  id: string;
  name: string;
  prompt: string;
  expected: string;
};

type TestResult = {
  scenarioId: string;
  prompt: string;
  name: string;
  reply: string;
  passed: boolean;
  suggestion: string;
};

const ROLE_SCENARIOS: Record<string, Scenario[]> = {
  sales: [
    {
      id: "sales_greet",
      name: "Greeting Identity",
      prompt: "Hello, who is this?",
      expected: "Agent should identify their name and state they represent the company.",
    },
    {
      id: "sales_pricing",
      name: "Pricing Inquiry Guidance",
      prompt: "How much does your service cost?",
      expected:
        "Agent should offer to book a discovery call or collect information, rather than inventing prices.",
    },
    {
      id: "sales_competitor",
      name: "Handling Competitors",
      prompt: "Why should I pick you over standard options?",
      expected:
        "Agent should deliver a strong value proposition or differentiator without badmouthing.",
    },
    {
      id: "sales_dnc",
      name: "Respecting DNC requests",
      prompt: "I am not interested, please take me off your list.",
      expected: "Agent should apologize and confirm removal from database/list.",
    },
    {
      id: "sales_close",
      name: "Sales Close attempt",
      prompt: "Okay, looks good, how do we start?",
      expected:
        "Agent should suggest scheduling an onboarding call or taking down contact details to start.",
    },
  ],
  appointment_scheduler: [
    {
      id: "sched_greet",
      name: "Scheduling Greet",
      prompt: "Hi, who am I speaking with?",
      expected: "Agent identifies as a scheduling assistant.",
    },
    {
      id: "sched_book",
      name: "Proposing time slots",
      prompt: "I want to schedule an appointment for tomorrow morning.",
      expected: "Agent checks availability and offers options.",
    },
    {
      id: "sched_resched",
      name: "Reschedule request",
      prompt: "Can I change my appointment time?",
      expected: "Agent walks through rescheduling flow.",
    },
    {
      id: "sched_text",
      name: "Link by Text",
      prompt: "I don't have time right now, can you send me a text link?",
      expected: "Agent offers to send link or confirm number.",
    },
    {
      id: "sched_duration",
      name: "Answering appointment details",
      prompt: "How long does a standard session take?",
      expected: "Agent details the length of the session.",
    },
  ],
  technical_support: [
    {
      id: "tech_greet",
      name: "Support Greet & Diagnostic Scoping",
      prompt: "My server went down!",
      expected: "Agent greets and asks clarifying diagnostic questions about symptoms.",
    },
    {
      id: "tech_credentials",
      name: "Credential Security",
      prompt: "Can I give you my API token to fix this?",
      expected: "Agent declines secrets and directs to the Settings integration portal.",
    },
    {
      id: "tech_escalate",
      name: "Critical Security Escalation",
      prompt: "I think we had a major data breach.",
      expected: "Agent escalates immediately to a human supervisor.",
    },
    {
      id: "tech_log",
      name: "Ticket Creation",
      prompt: "Can you log a ticket for this issue?",
      expected: "Agent confirms support ticket creation with details.",
    },
    {
      id: "tech_verify",
      name: "Live Verification",
      prompt: "I restarted it. Is it fixed?",
      expected: "Agent asks to verify operations live.",
    },
  ],
  lead_qualifier: [
    {
      id: "lq_greet",
      name: "Lead Greet & Role Identity",
      prompt: "Hi, who is this?",
      expected: "Agent greets and identifies role as intake/qualification assistant.",
    },
    {
      id: "lq_volume",
      name: "Volume Screening",
      prompt: "We get about 10 calls a day.",
      expected: "Agent screens volume and asks qualifying follow-up questions.",
    },
    {
      id: "lq_budget",
      name: "Budget Qualification",
      prompt: "Is this expensive?",
      expected: "Agent discusses value/pricing tier fits accurately.",
    },
    {
      id: "lq_decision",
      name: "Authority Verification",
      prompt: "I am researching for my boss.",
      expected: "Agent asks if they or the boss is the final decision-maker.",
    },
    {
      id: "lq_close",
      name: "Handoff to Demo",
      prompt: "We need this set up next week.",
      expected: "Agent books a demo or directs to trial onboarding.",
    },
  ],
  collections: [
    {
      id: "coll_greet",
      name: "Identity Verification",
      prompt: "Why are you calling me?",
      expected: "Agent explains billing inquiry and verifies user identity.",
    },
    {
      id: "coll_dispute",
      name: "Disputed Balance",
      prompt: "I paid that bill last week!",
      expected: "Agent acknowledges dispute and offers to check records.",
    },
    {
      id: "coll_payment",
      name: "Payment Instructions",
      prompt: "How do I clear my balance?",
      expected: "Agent gives online payment steps.",
    },
    {
      id: "coll_hardship",
      name: "Hardship Accommodation",
      prompt: "I lost my job and cannot pay this now.",
      expected: "Agent expresses empathy and outlines options/payment plans.",
    },
    {
      id: "coll_confirm",
      name: "Promise-to-Pay Confirmation",
      prompt: "I will pay the balance tomorrow morning.",
      expected: "Agent logs promise-to-pay and thanks the caller.",
    },
  ],
  marketing: [
    {
      id: "mkt_greet",
      name: "Campaign Brief Intro",
      prompt: "Can you help me run a promo campaign?",
      expected: "Agent welcomes inquiry and introduces marketing/campaign options.",
    },
    {
      id: "mkt_lead",
      name: "Lead Generation Pitch",
      prompt: "How will this bring me more clients?",
      expected: "Agent explains GTM strategy and lead conversion.",
    },
    {
      id: "mkt_channel",
      name: "Omnichannel Explainer",
      prompt: "What channels do you use?",
      expected: "Agent lists voice, SMS, and email capabilities.",
    },
    {
      id: "mkt_copy",
      name: "Copywriting Draft",
      prompt: "Can you write an email hook for a plumbing service?",
      expected: "Agent drafts a compelling marketing email template.",
    },
    {
      id: "mkt_brief",
      name: "Information Gathering",
      prompt: "What do you need from me to start?",
      expected: "Agent requests campaign targets and offer details.",
    },
  ],
  personal_assistant: [
    {
      id: "pa_greet",
      name: "Assistant gatekeeping",
      prompt: "I need to talk to Mike Laurenzo right now.",
      expected: "Agent greets and asks for name and purpose of call.",
    },
    {
      id: "pa_schedule",
      name: "Calendar scheduling",
      prompt: "Can I book 30 minutes on his calendar?",
      expected: "Agent checks calendar availability and initiates booking.",
    },
    {
      id: "pa_priority",
      name: "Urgency screening",
      prompt: "This is a critical system emergency.",
      expected: "Agent flags urgency and prioritizes routing.",
    },
    {
      id: "pa_gatekeep",
      name: "Contact details shield",
      prompt: "Can I have his personal cell number?",
      expected: "Agent politely declines sharing direct cell and offers official routing.",
    },
    {
      id: "pa_message",
      name: "Message transcription",
      prompt: "Tell him the contract is ready for sign-off.",
      expected: "Agent takes down message details and confirms handoff.",
    },
  ],
  default: [
    {
      id: "cs_greet",
      name: "Service greeting",
      prompt: "Hello, who is this?",
      expected: "Agent identifies name and states they are here to assist.",
    },
    {
      id: "cs_cancel",
      name: "Cancellation inquiry",
      prompt: "I want to cancel my account.",
      expected: "Agent shows empathy and describes steps or offers escalation.",
    },
    {
      id: "cs_escalate",
      name: "Human escalation demand",
      prompt: "Let me talk to a real manager right now.",
      expected: "Agent routes immediately to a human or explains transfer.",
    },
    {
      id: "cs_location",
      name: "Hours and Location lookup",
      prompt: "Where are you guys located and when do you open?",
      expected: "Agent states address and business hours.",
    },
    {
      id: "cs_close",
      name: "Polite checkout",
      prompt: "Thank you for the help, goodbye!",
      expected: "Agent signs off warmly and professionally.",
    },
  ],
};

const evaluateTest = (
  scenarioId: string,
  reply: string,
): { passed: boolean; suggestion: string } => {
  const text = reply.toLowerCase();
  switch (scenarioId) {
    // Sales role scenarios
    case "sales_greet":
      if (/hello|hi|assistant|agent|representative|wireline/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return {
        passed: false,
        suggestion: "Ensure agent greets the caller and states their identity.",
      };
    case "sales_pricing":
      if (/schedule|book|call|appointment|price|cost|quote|details/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return {
        passed: false,
        suggestion: "Add a directive telling the agent to offer booking a call to discuss pricing.",
      };
    case "sales_competitor":
      if (
        /why|us|offering|quality|service|special|differentiator|focus/i.test(text) ||
        text.length > 20
      ) {
        return { passed: true, suggestion: "" };
      }
      return {
        passed: false,
        suggestion:
          "Add a directive describing the agent's key differentiators or value proposition.",
      };
    case "sales_dnc":
      if (/dnc|remove|stop|confirm|apologize|number|calling|do not call/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return {
        passed: false,
        suggestion: "Add a DNC preset or directive to immediately respect DNC requests.",
      };
    case "sales_close":
      if (/book|schedule|appointment|next|start|calendar|details|time/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return {
        passed: false,
        suggestion:
          "Add a directive forcing the agent to proactively close the sale and suggest booking.",
      };

    // Scheduler scenarios
    case "sched_greet":
      if (/schedule|scheduler|book|appointment|calendar|assistant/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return {
        passed: false,
        suggestion: "Ensure agent introduces themselves as a scheduling assistant.",
      };
    case "sched_book":
      if (/book|schedule|time|date|slot|calendar|tomorrow|available/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return {
        passed: false,
        suggestion: "Add a directive to check calendar availability or propose specific slots.",
      };
    case "sched_resched":
      if (/reschedule|change|move|look|check|availability|time/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return {
        passed: false,
        suggestion:
          "Ensure the agent has directives on how to reschedule or cancel existing slots.",
      };
    case "sched_text":
      if (/text|sms|link|message|send|number/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return {
        passed: false,
        suggestion: "Add a directive to offer sending booking links via text/SMS.",
      };
    case "sched_duration":
      if (/hour|minute|time|duration|take|long/i.test(text) || text.length > 15) {
        return { passed: true, suggestion: "" };
      }
      return { passed: false, suggestion: "Define the service duration in the knowledge base." };

    // Technical Support scenarios
    case "tech_greet":
      if (/support|technical|diagnostic|scope|symptom|issue|problem|happen|changed/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return {
        passed: false,
        suggestion: "Add a directive to begin troubleshooting by scoping symptoms.",
      };
    case "tech_credentials":
      if (/settings|credentials|integration|never|api|key|token|decline/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return {
        passed: false,
        suggestion: "Add a directive to refuse receiving API secrets/passwords over calls.",
      };
    case "tech_escalate":
      if (/escalate|transfer|human|security|manager|representative/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return {
        passed: false,
        suggestion: "Ensure security/data-loss claims route directly to human escalation.",
      };
    case "tech_log":
      if (/ticket|create|log|file|support/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return {
        passed: false,
        suggestion: "Instruct the agent to log tickets with full diagnostics.",
      };
    case "tech_verify":
      if (/verify|check|test|confirm|work|run/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return { passed: false, suggestion: "Add a directive to verify every fix live on the call." };

    // Lead Qualifier scenarios
    case "lq_greet":
      if (/hello|hi|assistant|agent|intake|qualif|help/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return {
        passed: false,
        suggestion: "Ensure agent greets and states they handle intake/qualification.",
      };
    case "lq_volume":
      if (/volume|call|lead|many|week|day|screening/i.test(text) || text.length > 15) {
        return { passed: true, suggestion: "" };
      }
      return { passed: false, suggestion: "Instruct agent to screens caller's business volume." };
    case "lq_budget":
      if (/budget|cost|price|tier|plan|trial/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return { passed: false, suggestion: "Ensure agent qualification covers budget indicators." };
    case "lq_decision":
      if (/boss|decision|authority|maker|owner|green-light/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return {
        passed: false,
        suggestion: "Add a directive to verify if caller is the decision-maker.",
      };
    case "lq_close":
      if (/book|schedule|call|callback|appointment|demo|trial/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return {
        passed: false,
        suggestion: "Instruct agent to route qualified leads to demo booking.",
      };

    // Collections scenarios
    case "coll_greet":
      if (/billing|collections|verify|identity|account|name/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return {
        passed: false,
        suggestion: "Ensure agent verifies identity before discussing account balances.",
      };
    case "coll_dispute":
      if (/dispute|check|record|receipt|verify|log/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return {
        passed: false,
        suggestion: "Add a directive to acknowledge disputes and verify records.",
      };
    case "coll_payment":
      if (/pay|portal|credit|card|online|method/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return {
        passed: false,
        suggestion: "Describe online balance clearance instructions in knowledge.",
      };
    case "coll_hardship":
      if (/hardship|plan|installments|extension|help|apologize/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return {
        passed: false,
        suggestion: "Instruct agent to offer structured payment plans for hardships.",
      };
    case "coll_confirm":
      if (/promise|confirm|tomorrow|date|pay|log/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return { passed: false, suggestion: "Add a directive to confirm and log promises-to-pay." };

    // Marketing scenarios
    case "mkt_greet":
      if (/marketing|campaign|promo|options|help/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return {
        passed: false,
        suggestion: "Ensure agent greets and introduces campaign/promo services.",
      };
    case "mkt_lead":
      if (/lead|customer|prospect|reach|gtm|conversion/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return { passed: false, suggestion: "Ensure agent explains lead conversion capabilities." };
    case "mkt_channel":
      if (/email|sms|voice|channel|phone/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return {
        passed: false,
        suggestion: "Ensure agent mentions voice, SMS, and email marketing channels.",
      };
    case "mkt_copy":
      if (/draft|write|copy|sequence|subject|email|plumbing/i.test(text) || text.length > 25) {
        return { passed: true, suggestion: "" };
      }
      return {
        passed: false,
        suggestion: "Ensure agent can draft compelling email/marketing copy templates.",
      };
    case "mkt_brief":
      if (/brief|outline|information|detail|target/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return {
        passed: false,
        suggestion: "Add a directive to collect campaign parameters/details.",
      };

    // Personal Assistant scenarios
    case "pa_greet":
      if (/assistant|gatekeeper|mike|laurenzo|available|greet|speak/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return {
        passed: false,
        suggestion: "Ensure agent greets and scopes the caller and call purpose.",
      };
    case "pa_schedule":
      if (/schedule|book|calendar|time|slot|appointment/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return { passed: false, suggestion: "Add a directive to schedule slots on Mike's calendar." };
    case "pa_priority":
      if (/urgent|emergency|priority|critical|escalate/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return {
        passed: false,
        suggestion: "Instruct agent to route critical system emergencies immediately.",
      };
    case "pa_gatekeep":
      if (/number|cell|phone|private|decline|email|message/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return {
        passed: false,
        suggestion: "Refuse sharing Mike's private cell, offering routing alternatives.",
      };
    case "pa_message":
      if (/message|take|pass|note|confirm|relay/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return { passed: false, suggestion: "Add a directive to confirm transcription of messages." };

    // Customer Service scenarios
    case "cs_greet":
      if (/hello|hi|assistant|agent|help|wireline/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return { passed: false, suggestion: "Ensure agent greets and asks how they can help." };
    case "cs_cancel":
      if (/sorry|understand|cancel|membership|account|escalate|manager/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return {
        passed: false,
        suggestion:
          "Add a directive to empathize first before explaining cancellation instructions.",
      };
    case "cs_escalate":
      if (/escalate|transfer|human|manager|representative|connect|person/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return {
        passed: false,
        suggestion: "Add the escalation trigger directive to route immediately to a human.",
      };
    case "cs_location":
      if (/hour|open|location|address|street|time|close|find/i.test(text) || text.length > 20) {
        return { passed: true, suggestion: "" };
      }
      return {
        passed: false,
        suggestion: "Ensure business hours and location are documented in the knowledge base.",
      };
    case "cs_close":
      if (/bye|goodbye|day|welcome|thank|help/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return {
        passed: false,
        suggestion: "Ensure agent closes with a friendly, helpful sign-off.",
      };

    default:
      return { passed: true, suggestion: "" };
  }
};

type BehavioralRegressionTestsProps = {
  agentId: string;
  agentRole?: string;
  onAddDirective: (directive: string) => Promise<void>;
};

export default function BehavioralRegressionTests({
  agentId,
  agentRole,
  onAddDirective,
}: BehavioralRegressionTestsProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);
  const [expandedResults, setExpandedResults] = useState<Record<string, boolean>>({});

  // Map agent configuration role to scenario key
  const getNormalizedRole = (role: string | undefined): string => {
    if (!role) return "default";
    if (role === "sales" || role === "wireline_sales") return "sales";
    if (role === "scheduler" || role === "appointment_scheduler") return "appointment_scheduler";
    if (role === "technical_support" || role === "wireline_technical") return "technical_support";
    if (role === "lead_qualifier") return "lead_qualifier";
    if (role === "collections") return "collections";
    if (role === "marketing") return "marketing";
    if (role === "personal_assistant") return "personal_assistant";
    return "default";
  };
  const normalizedRole = getNormalizedRole(agentRole);
  const scenarios = ROLE_SCENARIOS[normalizedRole] || ROLE_SCENARIOS["default"];

  const runSuite = async () => {
    setIsRunning(true);
    setResults([]);
    try {
      const promises = scenarios.map(async (scen) => {
        try {
          const res = await authFetch(`/api/agents/${agentId}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: scen.prompt,
              history: [], // clean state for each synthetic test turn
            }),
          });
          if (!res.ok) throw new Error("API call failed");
          const data = await res.json();
          const reply = data.reply || "(no response)";
          const evaluation = evaluateTest(scen.id, reply);

          return {
            scenarioId: scen.id,
            name: scen.name,
            prompt: scen.prompt,
            reply,
            passed: evaluation.passed,
            suggestion: evaluation.suggestion,
          };
        } catch {
          return {
            scenarioId: scen.id,
            name: scen.name,
            prompt: scen.prompt,
            reply: "Failed to connect to agent simulator.",
            passed: false,
            suggestion: "Network or API timeout. Verify LLM configuration is healthy.",
          };
        }
      });

      const suiteResults = await Promise.all(promises);
      setResults(suiteResults);
    } catch (e) {
      clientLog.error("behavioral-regression:run-suite", e);
    } finally {
      setIsRunning(false);
    }
  };

  const toggleExpand = (scenId: string) => {
    setExpandedResults((prev) => ({
      ...prev,
      [scenId]: !prev[scenId],
    }));
  };

  const passCount = results.filter((r) => r.passed).length;
  const scorePercent = results.length > 0 ? (passCount / results.length) * 100 : 0;

  return (
    <section className="rounded-md wl-panel-elevated border border-border p-4 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md wl-panel border border-brand/30 text-brand flex items-center justify-center shrink-0">
            <PlayCircle className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-display italic text-xl text-foreground">
              Behavioral regression tests
            </h3>
            <p className="wl-label text-foreground/55">
              Run synthetic test suite to guard against agent drift
            </p>
          </div>
        </div>
        <ShadButton
          type="button"
          variant="outline"
          size="sm"
          disableAnimations
          onClick={runSuite}
          disabled={isRunning}
          className="h-8 rounded-md border-brand/40 bg-brand/8 text-brand wl-label hover:bg-brand/15"
        >
          {isRunning ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
              Testing...
            </>
          ) : (
            <>
              <PlayCircle className="w-3.5 h-3.5 mr-1.5" />
              Run Test Suite
            </>
          )}
        </ShadButton>
      </div>

      {results.length > 0 && (
        <div className="space-y-4">
          {/* Overall score */}
          <div className="rounded-md bg-black/20 border border-white/8 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-foreground/75 uppercase tracking-wider">
                Suite Performance
              </span>
              <span
                className={`text-xs font-bold uppercase ${scorePercent >= 80 ? "text-emerald-500" : "text-amber-500"}`}
              >
                {passCount} / {results.length} Scenarios Passed
              </span>
            </div>
            <div className="h-2 w-full bg-black/40 rounded-full overflow-hidden border border-white/5">
              <div
                className={`h-full transition-all duration-500 ${scorePercent >= 80 ? "bg-emerald-500" : "bg-amber-500"}`}
                data-pct={`${scorePercent}%`}
              />
            </div>
          </div>

          {/* Results grid */}
          <div className="grid grid-cols-1 gap-3">
            {results.map((r) => {
              const isExpanded = expandedResults[r.scenarioId];
              return (
                <div
                  key={r.scenarioId}
                  className="rounded-md wl-panel border border-border p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                        {r.name}
                      </h4>
                      <p className="text-[11px] text-muted mt-0.5">
                        Prompt: <strong className="text-foreground/80">"{r.prompt}"</strong>
                      </p>
                    </div>
                    <span
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold border ${
                        r.passed
                          ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-500"
                          : "bg-rose-500/15 border-rose-500/30 text-rose-500"
                      }`}
                    >
                      {r.passed ? (
                        <>
                          <CheckCircle2 className="w-3 h-3" />
                          Passed
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3 h-3" />
                          Failed
                        </>
                      )}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] text-foreground/55 uppercase tracking-widest">
                      Agent Response:
                    </span>
                    <p
                      className={`text-xs font-mono leading-relaxed bg-black/25 rounded p-2.5 border border-border truncate-2-lines cursor-pointer ${
                        isExpanded ? "whitespace-normal break-words" : "truncate"
                      }`}
                      onClick={() => toggleExpand(r.scenarioId)}
                    >
                      {r.reply}
                    </p>
                    {r.reply.length > 120 && (
                      <ShadButton
                        type="button"
                        variant="ghost"
                        disableAnimations
                        onClick={() => toggleExpand(r.scenarioId)}
                        className="text-[10px] text-brand hover:underline p-0 h-auto hover:bg-transparent font-medium block uppercase tracking-wider"
                      >
                        {isExpanded ? "Collapse" : "Expand response"}
                      </ShadButton>
                    )}
                  </div>

                  {!r.passed && r.suggestion && (
                    <div className="rounded bg-rose-500/5 border border-rose-500/15 p-2 flex items-start gap-2 text-[11px]">
                      <div className="flex-1 text-rose-400 font-medium">
                        <strong>Correction Suggestion:</strong> {r.suggestion}
                      </div>
                      <ShadButton
                        type="button"
                        variant="outline"
                        size="sm"
                        disableAnimations
                        onClick={() => onAddDirective(r.suggestion)}
                        className="h-6 rounded bg-rose-500/10 border-rose-500/30 hover:bg-rose-500/20 text-rose-400 text-[10px] font-semibold uppercase tracking-wider px-2"
                      >
                        <Plus className="w-2.5 h-2.5 mr-1" />
                        Apply suggestion
                      </ShadButton>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
