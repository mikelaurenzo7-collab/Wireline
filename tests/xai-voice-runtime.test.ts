import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  buildRealtimeSipSocketUrl,
  configuredPhoneVoiceProvider,
  providerNativeCallId,
  realtimeCallControlUrl,
  realtimeProviderForCallId,
  xaiCallId,
} from "../src/lib/voice/realtime-provider";
import {
  phoneCallVoiceFor,
  resolveXAIGrokVoiceModel,
  toXAIRealtimeSession,
  xaiForcedMessagePlaybackMs,
  xaiForceMessage,
  xaiVoiceForSavedVoice,
} from "../src/lib/voice/xai-voice-config";
import { buildXAISipUri, phoneNumberFromSipHeader } from "../src/lib/voice/xai-sip-config";
import { renderSipNoun } from "../src/lib/voice/realtime-sip-target";
import {
  buildXAIPhoneRegistrationBody,
  parseXAIPhoneRegistration,
} from "../src/lib/voice/xai-phone-registration";

const read = (path: string) => readFileSync(path, "utf8");

describe("xAI Grok Voice phone runtime", () => {
  it("routes a call to the provider named by its id", () => {
    const id = xaiCallId("call_abc123");
    expect(id).toBe("xai:call_abc123");
    expect(realtimeProviderForCallId(id)).toBe("xai");
    expect(realtimeProviderForCallId("rtc_123")).toBe("openai");
    expect(providerNativeCallId(id)).toBe("call_abc123");
    expect(buildRealtimeSipSocketUrl(id)).toBe("wss://api.x.ai/v1/realtime?call_id=call_abc123");
    expect(buildRealtimeSipSocketUrl("rtc_123")).toBe(
      "wss://api.openai.com/v1/realtime?call_id=rtc_123",
    );
    expect(realtimeCallControlUrl(id, "hangup")).toBe(
      "https://api.x.ai/v1/realtime/calls/call_abc123/hangup",
    );
    expect(realtimeCallControlUrl("rtc_123", "refer")).toBe(
      "https://api.openai.com/v1/realtime/calls/rtc_123/refer",
    );
    expect(() => buildRealtimeSipSocketUrl("xai:bad id")).toThrow();
  });

  it("keeps OpenAI the default until xAI is switched on", () => {
    expect(configuredPhoneVoiceProvider({})).toBe("openai");
    expect(configuredPhoneVoiceProvider({ WIRELINE_PHONE_VOICE_PROVIDER: " XAI " })).toBe("xai");
    expect(configuredPhoneVoiceProvider({ WIRELINE_PHONE_VOICE_PROVIDER: "grok" })).toBe("openai");
  });

  it("pins a versioned Grok Voice model and maps every saved voice", () => {
    expect(resolveXAIGrokVoiceModel({})).toBe("grok-voice-3.0");
    expect(resolveXAIGrokVoiceModel({ XAI_GROK_VOICE_MODEL: "grok-voice-latest" })).toBe(
      "grok-voice-3.0",
    );
    expect(resolveXAIGrokVoiceModel({ XAI_GROK_VOICE_MODEL: "grok-voice-3.1" })).toBe(
      "grok-voice-3.1",
    );
    expect(xaiVoiceForSavedVoice("marin")).toBe("eve");
    expect(xaiVoiceForSavedVoice("cedar")).toBe("rex");
    expect(xaiVoiceForSavedVoice("ara")).toBe("ara");
    expect(xaiVoiceForSavedVoice("unknown")).toBe("eve");
    // Owner-facing labels name the voice callers actually hear.
    expect(phoneCallVoiceFor("cedar", { WIRELINE_PHONE_VOICE_PROVIDER: "xai" })).toEqual({
      provider: "xai",
      voice: "rex",
    });
    expect(phoneCallVoiceFor("cedar", {})).toBeNull();
  });

  it("sends xAI only the session fields it documents", () => {
    const session = toXAIRealtimeSession(
      {
        type: "realtime",
        model: "gpt-realtime-2.1",
        instructions: "Base",
        truncation: { type: "retention_ratio" },
        tool_choice: "auto",
        tools: [
          { type: "function", name: "book", description: "Book", parameters: { type: "object" } },
          { type: "mcp", server_label: "x" },
        ],
        audio: {
          input: {
            noise_reduction: { type: "near_field" },
            turn_detection: { type: "semantic_vad" },
          },
          output: { voice: "cedar" },
        },
      },
      {
        instructions: "Call instructions",
        keyterms: ["Front Desk", " ", "x".repeat(60), "Front Desk"],
      },
    );
    expect(session).toEqual({
      model: "grok-voice-3.0",
      instructions: "Call instructions",
      voice: "rex",
      reasoning: { effort: "high" },
      tools: [
        { type: "function", name: "book", description: "Book", parameters: { type: "object" } },
      ],
      tool_choice: "auto",
      turn_detection: { type: "server_vad" },
      audio: { input: { transcription: { model: "grok-transcribe", keyterms: ["Front Desk"] } } },
    });
  });

  it("speaks the compliance opening verbatim and uninterrupted", () => {
    expect(xaiForceMessage("This call may be recorded.")).toEqual({
      type: "conversation.item.create",
      item: {
        type: "force_message",
        role: "assistant",
        interruptible: false,
        content: [{ type: "output_text", text: "This call may be recorded." }],
      },
    });
    // xAI has no playback-drain event: five words at a slow 2.2 words/s plus margin.
    expect(xaiForcedMessagePlaybackMs("This call may be recorded.")).toBe(3773);
  });

  it("bridges Twilio to the registered number with digest credentials", () => {
    const uri = buildXAISipUri("+13125550100", { name: "X-BB-Inbound", token: "a.b+c" });
    expect(uri).toBe("sip:+13125550100@sip.voice.x.ai;transport=tls?X-BB-Inbound=a.b%2Bc");
    expect(() => buildXAISipUri("3125550100", { name: "X-BB-Inbound", token: "t" })).toThrow();
    expect(renderSipNoun({ provider: "xai", uri, username: "bbuser", password: 'p"&<' })).toBe(
      '<Sip username="bbuser" password="p&quot;&amp;&lt;">sip:+13125550100@sip.voice.x.ai;transport=tls?X-BB-Inbound=a.b%2Bc</Sip>',
    );
    expect(renderSipNoun({ provider: "openai", uri: "sip:proj_x@sip.api.openai.com" })).toBe(
      "<Sip>sip:proj_x@sip.api.openai.com</Sip>",
    );
    expect(phoneNumberFromSipHeader("<sip:+13125550100@sip.voice.x.ai>;tag=1")).toBe(
      "+13125550100",
    );
    expect(phoneNumberFromSipHeader("<sip:anonymous@host>")).toBeNull();
  });

  it("registers a number with digest auth and requires the one-time secret back", () => {
    expect(
      buildXAIPhoneRegistrationBody({
        phoneNumber: "+13125550100",
        webhookUrl: "https://botbound.app/api/webhooks/xai/realtime",
        credentials: { username: "bbabc", password: "secret" },
      }),
    ).toEqual({
      origin: "byo_trunk",
      name: "BotBound +13125550100",
      phone_number: "+13125550100",
      sip_auth: { auth_username: "bbabc", auth_password: "secret" },
      webhook: {
        name: "BotBound voice +13125550100",
        url: "https://botbound.app/api/webhooks/xai/realtime",
      },
    });
    expect(
      parseXAIPhoneRegistration({
        phone_number: { phone_number_id: "pn_1" },
        webhook: { webhook_id: "wh_1", dispatch_signing_secret: "whsec_x" },
      }),
    ).toEqual({ xaiPhoneNumberId: "pn_1", xaiWebhookId: "wh_1", signingSecret: "whsec_x" });
    expect(() =>
      parseXAIPhoneRegistration({ phone_number: { phone_number_id: "pn_1" } }),
    ).toThrow();
  });

  it("admits xAI webhooks through the same guarded pipeline as OpenAI", () => {
    const routes = read("src/routes/openai-sip-routes.ts");
    expect(routes).toContain('"/api/webhooks/xai/realtime"');
    expect(routes).toContain("await xaiWebhookSecretFor(registeredNumber)");
    expect(routes).toContain("forwardOpenAISipWebhook(req, res, raw, XAI_SIP_WEBHOOK_PATH)");
    expect(routes).toContain("xaiCallId(nativeCallId)");
    expect(routes.match(/await admitRealtimeCall\(/g)).toHaveLength(2);
    expect(read("src/middleware/same-origin.ts")).toContain('"/api/webhooks/xai/realtime"');
    expect(read("src/lib/body-parsers.ts")).toContain('"/api/webhooks/xai/realtime"');
    expect(read("src/lib/voice/openai-sip-worker-app.ts")).toContain(
      "[OPENAI_SIP_WEBHOOK_PATH, XAI_SIP_WEBHOOK_PATH]",
    );
  });

  it("runs platform queries outside tenant scope by awaiting them inside it", async () => {
    // Drizzle builders are lazy: returning one from tenantStore.exit runs the
    // query after the tenant scope is restored, silently under that tenant.
    // drizzle.transaction() and an explicit .execute() start eagerly, so they
    // are safe to return.
    const { readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          walk(path);
          continue;
        }
        if (!/\.tsx?$/.test(name)) continue;
        const source = read(path);
        for (const match of source.matchAll(
          /tenantStore\.exit\(\(\) =>\s*drizzle(?!\.transaction\()/g,
        )) {
          const rest = source.slice(match.index);
          const call = rest.slice(0, rest.search(/\n\s*\);/));
          if (!call.includes(".execute()")) offenders.push(path);
        }
      }
    };
    walk("src");
    expect(offenders).toEqual([]);
  });

  it("keeps registration secrets out of tenant database scope", () => {
    const service = read("src/lib/voice/xai-phone-registration.ts");
    expect(service).toContain("tenantStore.exit(async () => await operation())");
    expect(service).toContain("encryptSecret(registration.signingSecret)");
    expect(service).toContain("encryptSecret(credentials.password)");
    const migration = read("drizzle/migrations/0181_xai_phone_registrations.sql");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("FROM anon, authenticated, service_role");
    // The server role sees rows only when no tenant is in scope.
    expect(migration).toContain(
      "TO wireline_server USING ((SELECT public.wireline_current_user_id()) IS NULL)",
    );
  });
});
