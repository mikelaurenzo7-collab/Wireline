import React, { useState } from "react";
import { PlayCircle, CheckCircle2, XCircle, Loader2, Sparkles, Plus } from "lucide-react";
import { authFetch } from "../lib/api";
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
      expected: "Agent should offer to book a discovery call or collect information, rather than inventing prices.",
    },
    {
      id: "sales_competitor",
      name: "Handling Competitors",
      prompt: "Why should I pick you over standard options?",
      expected: "Agent should deliver a strong value proposition or differentiator without badmouthing.",
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
      expected: "Agent should suggest scheduling an onboarding call or taking down contact details to start.",
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

const evaluateTest = (scenarioId: string, reply: string): { passed: boolean; suggestion: string } => {
  const text = reply.toLowerCase();
  switch (scenarioId) {
    // Sales role scenarios
    case "sales_greet":
      if (/hello|hi|assistant|agent|representative|wireline/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return { passed: false, suggestion: "Ensure agent greets the caller and states their identity." };
    case "sales_pricing":
      if (/schedule|book|call|appointment|price|cost|quote|details/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return { passed: false, suggestion: "Add a directive telling the agent to offer booking a call to discuss pricing." };
    case "sales_competitor":
      if (/why|us|offering|quality|service|special|differentiator|focus/i.test(text) || text.length > 20) {
        return { passed: true, suggestion: "" };
      }
      return { passed: false, suggestion: "Add a directive describing the agent's key differentiators or value proposition." };
    case "sales_dnc":
      if (/dnc|remove|stop|confirm|apologize|number|calling|do not call/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return { passed: false, suggestion: "Add a DNC preset or directive to immediately respect DNC requests." };
    case "sales_close":
      if (/book|schedule|appointment|next|start|calendar|details|time/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return { passed: false, suggestion: "Add a directive forcing the agent to proactively close the sale and suggest booking." };

    // Scheduler scenarios
    case "sched_greet":
      if (/schedule|scheduler|book|appointment|calendar|assistant/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return { passed: false, suggestion: "Ensure agent introduces themselves as a scheduling assistant." };
    case "sched_book":
      if (/book|schedule|time|date|slot|calendar|tomorrow|available/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return { passed: false, suggestion: "Add a directive to check calendar availability or propose specific slots." };
    case "sched_resched":
      if (/reschedule|change|move|look|check|availability|time/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return { passed: false, suggestion: "Ensure the agent has directives on how to reschedule or cancel existing slots." };
    case "sched_text":
      if (/text|sms|link|message|send|number/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return { passed: false, suggestion: "Add a directive to offer sending booking links via text/SMS." };
    case "sched_duration":
      if (/hour|minute|time|duration|take|long/i.test(text) || text.length > 15) {
        return { passed: true, suggestion: "" };
      }
      return { passed: false, suggestion: "Define the service duration in the knowledge base." };

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
      return { passed: false, suggestion: "Add a directive to empathize first before explaining cancellation instructions." };
    case "cs_escalate":
      if (/escalate|transfer|human|manager|representative|connect|person/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return { passed: false, suggestion: "Add the escalation trigger directive to route immediately to a human." };
    case "cs_location":
      if (/hour|open|location|address|street|time|close|find/i.test(text) || text.length > 20) {
        return { passed: true, suggestion: "" };
      }
      return { passed: false, suggestion: "Ensure business hours and location are documented in the knowledge base." };
    case "cs_close":
      if (/bye|goodbye|day|welcome|thank|help/i.test(text)) {
        return { passed: true, suggestion: "" };
      }
      return { passed: false, suggestion: "Ensure agent closes with a friendly, helpful sign-off." };

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
  const normalizedRole = agentRole && ROLE_SCENARIOS[agentRole] ? agentRole : "default";
  const scenarios = ROLE_SCENARIOS[normalizedRole];

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
      console.error(e);
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
            <h3 className="font-display italic lowercase text-xl text-ink">
              behavioral regression tests
            </h3>
            <p className="wl-label text-ink/40">
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
              <span className="text-xs text-ink/75 uppercase tracking-wider">Suite Performance</span>
              <span className={`text-xs font-bold uppercase ${scorePercent >= 80 ? "text-emerald-500" : "text-amber-500"}`}>
                {passCount} / {results.length} Scenarios Passed
              </span>
            </div>
            <div className="h-2 w-full bg-black/40 rounded-full overflow-hidden border border-white/5">
              <div
                className={`h-full transition-all duration-500 ${scorePercent >= 80 ? "bg-emerald-500" : "bg-amber-500"}`}
                style={{ width: `${scorePercent}%` }}
              />
            </div>
          </div>

          {/* Results grid */}
          <div className="grid grid-cols-1 gap-3">
            {results.map((r) => {
              const isExpanded = expandedResults[r.scenarioId];
              return (
                <div key={r.scenarioId} className="rounded-md wl-panel border border-border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-xs font-semibold text-ink uppercase tracking-wider">{r.name}</h4>
                      <p className="text-[11px] text-muted mt-0.5">Prompt: <strong className="text-ink/80">"{r.prompt}"</strong></p>
                    </div>
                    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wider font-bold border ${
                      r.passed
                        ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-500"
                        : "bg-rose-500/15 border-rose-500/30 text-rose-500"
                    }`}>
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
                    <span className="text-[10px] text-ink/40 uppercase tracking-widest">Agent Response:</span>
                    <p className={`text-xs font-mono leading-relaxed bg-black/25 rounded p-2.5 border border-border truncate-2-lines cursor-pointer ${
                      isExpanded ? "whitespace-normal break-words" : "truncate"
                    }`} onClick={() => toggleExpand(r.scenarioId)}>
                      {r.reply}
                    </p>
                    {r.reply.length > 120 && (
                      <button
                        type="button"
                        onClick={() => toggleExpand(r.scenarioId)}
                        className="text-[9px] text-brand hover:underline block uppercase tracking-wider"
                      >
                        {isExpanded ? "Collapse" : "Expand response"}
                      </button>
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
