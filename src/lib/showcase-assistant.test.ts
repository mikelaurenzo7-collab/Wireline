/**
 * showcase-assistant.test.ts
 * ----------------------------------------------------------------------
 * Locks down the boundary between the two kinds of public showcase
 * lines:
 *
 *   - "cs"   — the real Wireline employee lines (Sarah, Liam). These ARE
 *             Wireline's front-line team, so they may escalate to a human
 *             (the founder) and schedule callbacks.
 *   - "demo" — the vertical role-play demos on the landing page. These
 *             must NEVER page the founder or his employees. They keep the
 *             self-service conversion tools (signup / account / payment
 *             link) so they can still help a prospect directly, but no
 *             owner-routing tools.
 *
 * A silent edit that re-exposed escalate_to_human / schedule_callback on
 * a demo line would route landing-page calls into the founder's triage
 * inbox — exactly what this suite prevents.
 */
import { describe, expect, it } from "vitest";

import {
  buildShowcaseAssistantPayload,
  buildShowcaseFunctionTools,
  buildShowcaseSystemPrompt,
  extractShowcaseDialedNumber,
  findShowcaseAgentByPayload,
  findShowcaseAgentByPhoneNumber,
  isOwnerRoutingShowcaseTool,
  showcaseToolNamesForKind,
  showcaseVapiAssistantName,
  SHOWCASE_WEBHOOK_URL,
} from "./showcase-assistant";
import { WIRELINE_CONTACT_AGENTS, WIRELINE_DEMO_AGENTS } from "../data/contact-agents";

const ALL_SHOWCASE = [...WIRELINE_CONTACT_AGENTS, ...WIRELINE_DEMO_AGENTS];

function showcaseKind(name: string): "cs" | "demo" {
  return WIRELINE_CONTACT_AGENTS.some((a) => a.name === name) ? "cs" : "demo";
}

describe("showcaseToolNamesForKind", () => {
  it("gives cs (employee) lines the full toolset including owner-routing tools", () => {
    const names = showcaseToolNamesForKind("cs");
    expect(names).toContain("escalate_to_human");
    expect(names).toContain("schedule_callback");
    // self-service conversion tools are always present
    expect(names).toContain("send_signup_link");
    expect(names).toContain("create_account");
    expect(names).toContain("send_payment_link");
  });

  it("strips owner-routing tools from demo lines but keeps self-service tools", () => {
    const names = showcaseToolNamesForKind("demo");
    expect(names).not.toContain("escalate_to_human");
    expect(names).not.toContain("schedule_callback");
    // demos can still send signup links / info and convert the caller
    expect(names).toContain("send_signup_link");
    expect(names).toContain("create_account");
    expect(names).toContain("send_payment_link");
  });
});

describe("buildShowcaseFunctionTools", () => {
  it("never emits owner-routing function tools for demo agents", () => {
    const toolNames = buildShowcaseFunctionTools("demo").map((t) => t.function.name);
    expect(toolNames).not.toContain("escalate_to_human");
    expect(toolNames).not.toContain("schedule_callback");
    expect(toolNames.length).toBeGreaterThan(0);
  });

  it("emits the escalation tool for cs agents", () => {
    const toolNames = buildShowcaseFunctionTools("cs").map((t) => t.function.name);
    expect(toolNames).toContain("escalate_to_human");
    expect(toolNames).toContain("schedule_callback");
  });
});

describe("isOwnerRoutingShowcaseTool", () => {
  it("flags the tools that page the founder", () => {
    expect(isOwnerRoutingShowcaseTool("escalate_to_human")).toBe(true);
    expect(isOwnerRoutingShowcaseTool("schedule_callback")).toBe(true);
  });

  it("flags legacy/internal tools that also route to the owner", () => {
    expect(isOwnerRoutingShowcaseTool("create_fleet_task")).toBe(true);
    expect(isOwnerRoutingShowcaseTool("capture_customer_profile")).toBe(true);
  });

  it("does not flag self-service or unknown tools", () => {
    expect(isOwnerRoutingShowcaseTool("send_signup_link")).toBe(false);
    expect(isOwnerRoutingShowcaseTool("create_account")).toBe(false);
    expect(isOwnerRoutingShowcaseTool("send_payment_link")).toBe(false);
    expect(isOwnerRoutingShowcaseTool("view_recent_interactions")).toBe(false);
    expect(isOwnerRoutingShowcaseTool("not_a_tool")).toBe(false);
  });
});

describe("buildShowcaseAssistantPayload — Flux transcriber", () => {
  const sarah = WIRELINE_CONTACT_AGENTS.find((a) => a.name === "Sarah")!;
  const liam = WIRELINE_CONTACT_AGENTS.find((a) => a.name === "Liam")!;
  const jordan = WIRELINE_DEMO_AGENTS.find((a) => a.name === "Jordan")!;
  const jake = WIRELINE_DEMO_AGENTS.find((a) => a.name === "Jake")!;

  it("Sarah uses Deepgram Flux EOT by default", () => {
    const payload = buildShowcaseAssistantPayload(sarah, "cs");
    expect(payload.transcriber.model).toBe("flux-general-en");
    expect(payload.startSpeakingPlan).not.toHaveProperty("smartEndpointingPlan");
    expect(payload.metadata.wireline_transcriber_mode).toBe("flux-eot");
  });

  it("Liam uses Deepgram Flux EOT by default", () => {
    const payload = buildShowcaseAssistantPayload(liam, "cs");
    expect(payload.transcriber.model).toBe("flux-general-en");
    expect(payload.transcriber.eotThreshold).toBe(0.64);
    expect(payload.transcriber.eotTimeoutMs).toBe(2800);
    expect(payload.startSpeakingPlan).not.toHaveProperty("smartEndpointingPlan");
    expect(payload.metadata.wireline_transcriber_mode).toBe("flux-eot");
  });

  it("Jake (sales demo) uses Deepgram Flux EOT by default", () => {
    const payload = buildShowcaseAssistantPayload(jake, "demo");
    expect(payload.transcriber.model).toBe("flux-general-en");
    expect(payload.metadata.wireline_transcriber_mode).toBe("flux-eot");
    expect(buildShowcaseFunctionTools("demo").map((t) => t.function.name)).not.toContain(
      "escalate_to_human",
    );
  });

  it("Jordan (CS demo) uses Deepgram Flux EOT and demo-only tools", () => {
    const payload = buildShowcaseAssistantPayload(jordan, "demo");
    expect(payload.name).toBe("Jordan — Inbound CS Demo");
    expect(payload.transcriber.model).toBe("flux-general-en");
    expect(payload.metadata.wireline_transcriber_mode).toBe("flux-eot");
    expect(payload.firstMessage).toMatch(/Wireline inbound demo/i);
    expect(payload.voice?.voiceId).toBe("mhJNZGgdePh7HbwWYwN2");
  });

  it("Sarah uses her configured support voice with expressive ElevenLabs tuning", () => {
    const payload = buildShowcaseAssistantPayload(sarah, "cs");
    expect(payload.name).toBe("Sarah — Wireline Customer Support");
    expect(payload.voice?.voiceId).toBe("onwK4e9ZLuTAKqWW03F9");
    expect(payload.voice?.stability).toBe(0.52);
    expect(payload.voice?.style).toBe(0.24);
    expect(payload.voice?.similarityBoost).toBe(0.86);
  });

  it("Liam uses energetic Liam voice tuning", () => {
    const payload = buildShowcaseAssistantPayload(liam, "cs");
    expect(payload.voice?.voiceId).toBe("iP95p4xoKVk53GoZ742B");
    expect(payload.voice?.style).toBe(0.22);
    expect(payload.firstMessage).toMatch(/Liam with Wireline/i);
  });

  it("Diana uses a discreet voice distinct from Sarah's", () => {
    const diana = WIRELINE_DEMO_AGENTS.find((a) => a.name === "Diana")!;
    const payload = buildShowcaseAssistantPayload(diana, "demo");
    expect(payload.voice?.voiceId).toBe("I1T6PEfqPxl45yKRN4aS");
    expect(payload.voice?.voiceId).not.toBe(sarah.voiceId);
  });
});

describe("buildShowcaseSystemPrompt — employee personas", () => {
  const sarah = WIRELINE_CONTACT_AGENTS.find((a) => a.name === "Sarah")!;
  const liam = WIRELINE_CONTACT_AGENTS.find((a) => a.name === "Liam")!;

  it("Sarah prompt includes support-first employee edge", () => {
    const prompt = buildShowcaseSystemPrompt(sarah, "cs");
    expect(prompt).toMatch(/SARAH'S EDGE/i);
    expect(prompt).toMatch(/flagship support voice/i);
  });

  it("Liam prompt includes growth-first employee edge", () => {
    const prompt = buildShowcaseSystemPrompt(liam, "cs");
    expect(prompt).toMatch(/LIAM'S EDGE/i);
    expect(prompt).toMatch(/ROI-minded/i);
  });
});

describe("buildShowcaseSystemPrompt — demo personalization", () => {
  const jordan = WIRELINE_DEMO_AGENTS.find((a) => a.name === "Jordan")!;
  const jake = WIRELINE_DEMO_AGENTS.find((a) => a.name === "Jake")!;
  const marcus = WIRELINE_DEMO_AGENTS.find((a) => a.name === "Marcus")!;
  const diana = WIRELINE_DEMO_AGENTS.find((a) => a.name === "Diana")!;

  it("Jordan prompt collects business name and extra demo context", () => {
    const prompt = buildShowcaseSystemPrompt(jordan, "demo");
    expect(prompt).toMatch(/DEMO PERSONALIZATION/i);
    expect(prompt).toMatch(/business name you should answer as on inbound calls/i);
    expect(prompt).toMatch(/ROLE-PLAY STANDARD — Inbound customer service/i);
    expect(prompt).not.toMatch(/escalate_to_human/);
  });

  it("Jake prompt asks for company to represent on sales calls", () => {
    const prompt = buildShowcaseSystemPrompt(jake, "demo");
    expect(prompt).toMatch(/company or brand you should represent/i);
    expect(prompt).toMatch(/ROLE-PLAY STANDARD — Outbound sales/i);
    expect(prompt).toMatch(/BANT-style qualification/i);
    expect(prompt).toMatch(/top SDR on a live call/i);
  });

  it("Marcus prompt includes medical intake role-play and HIPAA guardrails", () => {
    const prompt = buildShowcaseSystemPrompt(marcus, "demo");
    expect(prompt).toMatch(/practice or clinic name/i);
    expect(prompt).toMatch(/ROLE-PLAY STANDARD — Medical practice front desk/i);
    expect(prompt).toMatch(/Never diagnose, prescribe/i);
  });

  it("Diana prompt includes legal intake and conflict-check flow", () => {
    const prompt = buildShowcaseSystemPrompt(diana, "demo");
    expect(prompt).toMatch(/law firm name to use/i);
    expect(prompt).toMatch(/ROLE-PLAY STANDARD — Law firm intake/i);
    expect(prompt).toMatch(/conflict check/i);
  });
});

describe("showcase catalog — Vapi payload invariants", () => {
  it.each(ALL_SHOWCASE.map((a) => [a.name, a] as const))(
    "%s payload uses Flux EOT and omits deprecated inputMinCharacters",
    (name, agent) => {
      const payload = buildShowcaseAssistantPayload(agent, showcaseKind(name));
      expect(payload.transcriber.model).toBe("flux-general-en");
      expect(payload.metadata.wireline_transcriber_mode).toBe("flux-eot");
      expect(payload).not.toHaveProperty("inputMinCharacters");
    },
  );

  it.each(ALL_SHOWCASE.map((a) => [a.name, a] as const))(
    "%s has a stable Vapi assistant display name",
    (name, agent) => {
      const display = showcaseVapiAssistantName(agent);
      expect(display.startsWith(`${name} —`)).toBe(true);
      expect(display.length).toBeLessThan(80);
    },
  );

  it("demo agents never include owner-routing tools in payload", () => {
    for (const agent of WIRELINE_DEMO_AGENTS) {
      const tools = buildShowcaseAssistantPayload(agent, "demo").model.tools as Array<{
        function: { name: string };
      }>;
      const names = tools.map((t) => t.function.name);
      expect(names).not.toContain("escalate_to_human");
      expect(names).not.toContain("schedule_callback");
    }
  });

  it("employee lines include owner-routing tools in payload", () => {
    for (const agent of WIRELINE_CONTACT_AGENTS) {
      const tools = buildShowcaseAssistantPayload(agent, "cs").model.tools as Array<{
        function: { name: string };
      }>;
      const names = tools.map((t) => t.function.name);
      expect(names).toContain("escalate_to_human");
      expect(names).toContain("schedule_callback");
    }
  });

  it("payload includes serverUrlSecret when option provided", () => {
    const sarah = WIRELINE_CONTACT_AGENTS[0];
    const payload = buildShowcaseAssistantPayload(sarah, "cs", { serverUrlSecret: "test-secret" });
    expect(payload.serverUrlSecret).toBe("test-secret");
  });

  it("payload omits serverUrlSecret when option not provided", () => {
    const sarah = WIRELINE_CONTACT_AGENTS[0];
    const payload = buildShowcaseAssistantPayload(sarah, "cs");
    expect(payload).not.toHaveProperty("serverUrlSecret");
  });

  it("SHOWCASE_WEBHOOK_URL is used as serverUrl in all payloads", () => {
    const agent = WIRELINE_CONTACT_AGENTS[0];
    const payload = buildShowcaseAssistantPayload(agent, "cs");
    expect(payload.serverUrl).toBe(SHOWCASE_WEBHOOK_URL);
  });

  it("payload without voiceId omits voice block", () => {
    // Create a mock agent without a voiceId
    const agentNoVoice = { ...WIRELINE_CONTACT_AGENTS[0], voiceId: undefined };
    const payload = buildShowcaseAssistantPayload(agentNoVoice, "cs");
    expect(payload).not.toHaveProperty("voice");
  });
});

describe("buildShowcaseSystemPrompt — remaining demo agents", () => {
  it("Ria prompt uses concierge-specific opening flow", () => {
    const ria = WIRELINE_DEMO_AGENTS.find((a) => a.name === "Ria")!;
    if (!ria) return;
    const prompt = buildShowcaseSystemPrompt(ria, "demo");
    expect(prompt).toMatch(/concierge|vertical|pick a vertical/i);
    expect(prompt).toMatch(/ROLE-PLAY STANDARD — Demo concierge/i);
  });

  it("Aisha prompt includes real estate buyer qualification", () => {
    const aisha = WIRELINE_DEMO_AGENTS.find((a) => a.name === "Aisha")!;
    if (!aisha) return;
    const prompt = buildShowcaseSystemPrompt(aisha, "demo");
    expect(prompt).toMatch(/brokerage or team name/i);
    expect(prompt).toMatch(/ROLE-PLAY STANDARD — Real estate/i);
  });

  it("Elena prompt includes insurance intake flow", () => {
    const elena = WIRELINE_DEMO_AGENTS.find((a) => a.name === "Elena")!;
    if (!elena) return;
    const prompt = buildShowcaseSystemPrompt(elena, "demo");
    expect(prompt).toMatch(/agency name/i);
    expect(prompt).toMatch(/ROLE-PLAY STANDARD — Insurance/i);
  });
});

describe("extractShowcaseDialedNumber", () => {
  it("extracts from payload.call.phoneNumber as string", () => {
    expect(extractShowcaseDialedNumber({ call: { phoneNumber: "+16306425661" } })).toBe(
      "+16306425661",
    );
  });

  it("extracts from payload.call.phoneNumber.number as object", () => {
    expect(extractShowcaseDialedNumber({ call: { phoneNumber: { number: "+16305811834" } } })).toBe(
      "+16305811834",
    );
  });

  it("extracts from payload.message.call.phoneNumber as string", () => {
    expect(
      extractShowcaseDialedNumber({ message: { call: { phoneNumber: "+16306425661" } } }),
    ).toBe("+16306425661");
  });

  it("extracts from payload.message.call.phoneNumber.number as object", () => {
    expect(
      extractShowcaseDialedNumber({
        message: { call: { phoneNumber: { number: "+16306425661" } } },
      }),
    ).toBe("+16306425661");
  });

  it("returns null for empty payload", () => {
    expect(extractShowcaseDialedNumber({})).toBeNull();
  });

  it("returns null for payload with empty call object", () => {
    expect(extractShowcaseDialedNumber({ call: {} })).toBeNull();
  });

  it("returns null when phoneNumber is whitespace only", () => {
    expect(extractShowcaseDialedNumber({ call: { phoneNumber: "   " } })).toBeNull();
  });

  it("prefers call.phoneNumber over message.call.phoneNumber", () => {
    const result = extractShowcaseDialedNumber({
      call: { phoneNumber: "+16305811834" },
      message: { call: { phoneNumber: "+16306425661" } },
    });
    expect(result).toBe("+16305811834");
  });
});

describe("findShowcaseAgentByPhoneNumber", () => {
  it("returns null for null input", () => {
    expect(findShowcaseAgentByPhoneNumber(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(findShowcaseAgentByPhoneNumber(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(findShowcaseAgentByPhoneNumber("")).toBeNull();
  });

  it("returns null for unknown number", () => {
    expect(findShowcaseAgentByPhoneNumber("+19999999999")).toBeNull();
  });

  it("finds Sarah by her E.164 number", () => {
    const result = findShowcaseAgentByPhoneNumber("+16306425661");
    expect(result).not.toBeNull();
    expect(result!.agent.name).toBe("Sarah");
    expect(result!.kind).toBe("cs");
  });

  it("finds Liam by his E.164 number", () => {
    const result = findShowcaseAgentByPhoneNumber("+16305811834");
    expect(result).not.toBeNull();
    expect(result!.agent.name).toBe("Liam");
    expect(result!.kind).toBe("cs");
  });

  it("returns cs kind for all contact agents", () => {
    for (const agent of WIRELINE_CONTACT_AGENTS) {
      const result = findShowcaseAgentByPhoneNumber(agent.tel);
      if (result) expect(result.kind).toBe("cs");
    }
  });

  it("returns demo kind for demo agents", () => {
    for (const agent of WIRELINE_DEMO_AGENTS) {
      const result = findShowcaseAgentByPhoneNumber(agent.tel);
      if (result) expect(result.kind).toBe("demo");
    }
  });

  it("does not throw for arbitrary phone string formats", () => {
    const inputs = ["6306425661", "16306425661", "+1-630-642-5661", "(630) 642-5661", "abc"];
    for (const input of inputs) {
      expect(() => findShowcaseAgentByPhoneNumber(input)).not.toThrow();
    }
  });
});

describe("findShowcaseAgentByPayload", () => {
  it("returns null for empty payload", () => {
    expect(findShowcaseAgentByPayload({})).toBeNull();
  });

  it("finds Sarah from call.phoneNumber", () => {
    const result = findShowcaseAgentByPayload({ call: { phoneNumber: "+16306425661" } });
    expect(result?.agent.name).toBe("Sarah");
  });

  it("finds Liam from message.call.phoneNumber", () => {
    const result = findShowcaseAgentByPayload({
      message: { call: { phoneNumber: "+16305811834" } },
    });
    expect(result?.agent.name).toBe("Liam");
  });

  it("returns null for unknown number in payload", () => {
    expect(findShowcaseAgentByPayload({ call: { phoneNumber: "+10000000000" } })).toBeNull();
  });
});
