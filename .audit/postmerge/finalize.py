from pathlib import Path
from shutil import copyfile


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, value: str) -> None:
    Path(path).write_text(value, encoding="utf-8")


def replace_exact(path: str, old: str, new: str) -> None:
    text = read(path)
    if text.count(old) != 1:
        raise RuntimeError(f"{path}: expected exactly one match for {old[:100]!r}")
    write(path, text.replace(old, new, 1))


# These files deliberately override main after the native/main merge. They are
# validated against rendered output below, then the staging directory is removed
# before the final product commit.
for source, target in (
    (
        ".audit/postmerge/PrecisionPublicHeader.tsx",
        "src/components/marketing/PrecisionPublicHeader.tsx",
    ),
    (
        ".audit/postmerge/marketing-viewport-lock.spec.ts",
        "tests/e2e/marketing-viewport-lock.spec.ts",
    ),
    (
        ".audit/postmerge/marketing-a11y.spec.ts",
        "tests/e2e/marketing-a11y.spec.ts",
    ),
):
    copyfile(source, target)

activation_path = "src/lib/voice/xai-phone-activation-service.ts"
activation = read(activation_path)
legacy_cast = "const client = getTwilioClient() as any;"
if activation.count(legacy_cast) != 2:
    raise RuntimeError("expected exactly two legacy Twilio client casts")
write(activation_path, activation.replace(legacy_cast, "const client = getTwilioClient();"))

honesty_path = "tests/round6-honesty-compliance-contract.test.ts"
honesty = read(honesty_path)
duplicate_suffix = "\n});\n});\n"
if not honesty.endswith(duplicate_suffix):
    raise RuntimeError("expected duplicated sentinel-suite closure after combined-head rewrite")
write(honesty_path, honesty[: -len(duplicate_suffix)] + "\n});\n")

replace_exact(
    "tests/marketing-centering-contract.test.ts",
    '''    expect(header).toContain(
      '<nav className="ml-auto flex items-center gap-2 sm:gap-4" aria-label="Account">',
    );''',
    '''    expect(header).toContain('aria-label="Account"');
    expect(header).toContain("ml-auto flex min-w-0 shrink-0 items-center");
    expect(header).toContain("min-h-11");
    expect(header).toContain("whitespace-nowrap");
    expect(header).toContain("shrink-0");
    expect(header).toContain('data-testid="header-cta"');
    expect(header).toContain("max-[379px]:hidden");''',
)

replace_exact(
    "src/lib/marketing-route-meta.ts",
    "Privacy for Wireline's voice agent platform: account, conversation, authorized voice, billing, and measurement data. Last updated August 1, 2026.",
    "Privacy for Wireline's voice agent platform: account, conversation, authorized voice, billing, and measurement data. Last updated August 17, 2026.",
)

replace_exact(
    "src/data/wireline-knowledge.ts",
    '''export const WIRELINE_VOICE_STACK =
  "Live calls run through Twilio plus xAI Direct SIP Speech-to-Speech (grok-voice-think-fast-2.0). Studio live tests use the same voice brain. OpenAI Realtime is limited to the ChatGPT App preview because that host permits only OpenAI realtime WebRTC; it is not the PSTN runtime.";''',
    '''export const WIRELINE_VOICE_STACK =
  "Live calls run through Wireline's Twilio plus xAI Direct SIP voice plane. xAI currently routes registered SIP calls through Think Fast 2.0, while Studio tests pin that same version directly. OpenAI Realtime is limited to the ChatGPT App preview and is not the phone runtime.";''',
)

# Canonical repository docs must distinguish the browser model pin from the
# provider-bound SIP call and must not resurrect the retired video product.
replace_exact(
    "README.md",
    '''Wireline is the operating layer for **voice agents for personal and business conversations**: calls, texts, follow-up, browser context, email, and integrations. Start with one trained agent or build a coordinated roster that can book appointments, revive leads, promote offers, recover opportunities, answer demand, text outcomes, draft follow-up, and surface the right work across web, mobile, browser, and ChatGPT.''',
    '''Wireline is the operating layer for **voice agents for personal and business conversations**: calls, texts, follow-up, browser context, email, and integrations. Start with one trained agent or build a coordinated roster that can book appointments, recover opportunities, answer demand, text outcomes, draft follow-up, and surface the right work across web, mobile, browser, and ChatGPT. Marketing and campaign calling remain blocked until federal Do Not Call registration is complete.''',
)
replace_exact(
    "README.md",
    '''- **Voice/PSTN:** Twilio plus xAI Direct SIP Speech-to-Speech (`grok-voice-think-fast-2.0`) own production calling and Studio live tests. OpenAI Realtime is ChatGPT App private simulation only. Vapi is rollback-only. Realtime test surfaces never take over customer PSTN calls.''',
    '''- **Voice/PSTN:** Twilio plus xAI Direct SIP own production calling. xAI currently routes registered SIP calls through Think Fast 2.0, but the SIP `call_id` session is provider-bound rather than version-pinned by Wireline. Studio live tests pin `grok-voice-think-fast-2.0` directly. OpenAI Realtime is limited to ChatGPT App private simulation, and Vapi is rollback-only. Realtime test surfaces never take over customer PSTN calls.''',
)

replace_exact(
    "ARCHITECTURE.md",
    '''5. Optional video presenter support gives business agents a live visual face while preserving a Wireline-owned fallback.''',
    '''5. Every agent keeps an identity badge. Live talking-head video is retired; new presenter sessions, video files, and substitute clip scripts are not offered.''',
)
replace_exact(
    "ARCHITECTURE.md",
    '''  - Native Speech-to-Speech (`grok-voice-think-fast-2.0`, Eve/Ara/Rex/Sal/Leo) is the live call brain. Grok 4.6 is the structured-reasoning model, not a live-call id. Vapi remains rollback-only and is not on the production launch path.''',
    '''  - xAI currently routes registered SIP calls through Think Fast 2.0. The SIP `call_id` session is provider-bound and cannot be version-pinned by Wireline; a provider alias change requires recertification. Grok 4.6 is the structured-reasoning model, not a live-call id. Vapi remains rollback-only and is not on the production launch path.''',
)
replace_exact(
    "ARCHITECTURE.md",
    '''  - Studio live tests use the same native xAI Speech-to-Speech model family as PSTN, via server-minted ephemeral client secrets. OpenAI Realtime still powers ChatGPT private simulation (and an isolated ChatGPT spend credential when configured).''',
    '''  - Studio live tests use a direct xAI WebSocket pinned to `grok-voice-think-fast-2.0`, with the same Wireline instructions, tools, voice mapping, and safety policies used on phone calls. OpenAI Realtime still powers ChatGPT private simulation (and an isolated ChatGPT spend credential when configured).''',
)
replace_exact(
    "ARCHITECTURE.md",
    '''  - Personal agents, business agents, and hybrid direction all share this same managed chain — posture changes tools/copy/presenters, not the provider default.''',
    '''  - Personal agents, business agents, and hybrid direction all share this same managed chain — posture changes tools and workflow behavior, not the provider default.''',
)
replace_exact(
    "ARCHITECTURE.md",
    '''- **Video presenters:**
  - `src/lib/video-presenter/` wraps provider details behind Wireline-owned copy, status, consent, metering, and fallback language.
  - Customer surfaces should say presenter, face, or live video add-on, not vendor names.''',
    '''- **Retired video presenter boundary:**
  - Historical `src/lib/video-presenter/` and billing fields remain only for migration, settlement, and explicit retirement responses.
  - Public checkout and provider session minting stay closed. Customer surfaces show identity badges and must not imply that live talking-head video or generated clips are available.''',
)
replace_exact(
    "ARCHITECTURE.md",
    '''- Outbound marketing dials run tenant DNC + federal DNC (when configured) + TCPA consent gates before PSTN spend.''',
    '''- Outbound marketing dials run tenant DNC, federal DNC, TCPA consent, duplicate-dial, and calling-hours gates before PSTN spend. Marketing and campaign outbound remain fail-closed while federal DNC registration is incomplete.''',
)

replace_exact(
    "docs/VENDOR_LAUNCH_MAP.md",
    '''| PSTN orchestration | Native Twilio + xAI Direct SIP | `grok-voice-think-fast-2.0`; Vapi is rollback-only |''',
    '''| PSTN orchestration | Native Twilio + xAI Direct SIP | Provider-bound SIP session; xAI currently routes registered calls through Think Fast 2.0. Vapi is rollback-only. |''',
)
replace_exact(
    "docs/VENDOR_LAUNCH_MAP.md",
    '''| Live browser voice | Native xAI Speech-to-Speech, same model as PSTN | ChatGPT widget stays OpenAI Realtime (OpenAI-hosted iframe; not a Studio backup) |''',
    '''| Live browser voice | Direct xAI Speech-to-Speech pinned to `grok-voice-think-fast-2.0` | ChatGPT widget stays OpenAI Realtime; it is not a Studio backup |''',
)
replace_exact(
    "docs/VENDOR_LAUNCH_MAP.md",
    '''- Live Video is a separate fixed recurring add-on and does not use Stripe usage metering.''',
    '''- Live Video is retired. Historical product and price identifiers remain compatibility data only; new checkout, entitlement grants, and provider session minting stay closed.''',
)
replace_exact(
    "docs/VENDOR_LAUNCH_MAP.md",
    '''- Keep Vapi managed-call artifacts transcript-only unless a future explicit, auditable recording feature is introduced.''',
    '''- Keep call artifacts transcript-only unless a future explicit, auditable recording feature is introduced.''',
)

replace_exact(
    "docs/PRODUCTION_VOICE_RUNTIME_POLICY_2026-07-26.md",
    '''# Production Voice Runtime Policy — 2026-08-01''',
    '''# Production Voice Runtime Policy — 2026-08-17''',
)
replace_exact(
    "docs/PRODUCTION_VOICE_RUNTIME_POLICY_2026-07-26.md",
    '''| Phone calls          | Twilio carrier → xAI Direct SIP Speech-to-Speech (`grok-voice-think-fast-2.0`) | Native Eve/Ara/Rex/Sal/Leo voices. Direct `/v1/tts` is not the PSTN engine. Grok 4.6 is structured-only. Vapi is rollback-only. |
| Browser/mobile voice | Native xAI Speech-to-Speech using the same model as PSTN | ChatGPT widget stays OpenAI Realtime. No separate test brain. |
| Video presenter      | LiveAvatar/HeyGen catalog                                                                              | Presenter identity does not silently become the phone voice.                                          |''',
    '''| Phone calls          | Twilio carrier → xAI Direct SIP Voice Agent API | xAI currently routes registered SIP calls through Think Fast 2.0. The SIP `call_id` join is provider-bound and is not version-pinned by Wireline. Native xAI voices are the phone roster. Grok 4.6 is structured-only. Vapi is rollback-only. |
| Browser/mobile voice | Direct xAI Speech-to-Speech pinned to `grok-voice-think-fast-2.0` | Server-minted ephemeral client secrets. Same Wireline instructions, tools, voice mapping, and safety policy as PSTN. ChatGPT widget stays OpenAI Realtime and is not a Studio backup. |
| Video presenter      | Retired | Identity badges stay. Checkout and provider session minting remain closed. No video-file or substitute clip-script product is offered. |''',
)
replace_exact(
    "docs/PRODUCTION_VOICE_RUNTIME_POLICY_2026-07-26.md",
    '''- If provider access, ownership, approval, or voice identity cannot be proven, the runtime falls back to Savannah.''',
    '''- If native provider access, line ownership, encrypted registration evidence, or activation cannot be proven, phone activation fails closed. It does not silently move a tenant call to another provider.''',
)
replace_exact(
    "docs/PRODUCTION_VOICE_RUNTIME_POLICY_2026-07-26.md",
    '''- AI and cloned voices are artificial voices. Calling consent, DNC, calling-hours, recording, identification, and disclosure rules still apply.''',
    '''- AI and private voices are artificial voices. Calling consent, tenant DNC, federal DNC, calling-hours, recording, identification, and disclosure rules still apply.
- Marketing and campaign outbound remain blocked until federal Do Not Call registration is complete and the screening provider is configured.''',
)

replace_exact(
    "docs/GROK_LIVE_VOICE.md",
    '''Production PSTN and Studio live tests use Wireline-owned Twilio plus xAI Direct SIP Speech-to-Speech (`grok-voice-think-fast-2.0`). The unpinned `grok-voice-latest` alias is not the production pin. OpenAI Realtime remains ChatGPT-widget simulation. Vapi is rollback-only and is not on the launch path. This is not Grok 4.6.''',
    '''Production PSTN uses Wireline-owned Twilio plus xAI Direct SIP. Studio live tests use xAI Speech-to-Speech with the versioned `grok-voice-think-fast-2.0` model. These surfaces currently run the same model release, but the pin is enforceable only for direct browser WebSockets: xAI binds SIP `call_id` sessions to the registered phone session and ignores a `model` query parameter. As of August 5, 2026, `grok-voice-latest` routes to Think Fast 2.0. OpenAI Realtime remains limited to ChatGPT-widget simulation. Vapi is rollback-only and is not on the launch path. This is not Grok 4.6.''',
)
replace_exact(
    "docs/GROK_LIVE_VOICE.md",
    '''## Three different xAI products''',
    '''## Four distinct runtime identities''',
)
replace_exact(
    "docs/GROK_LIVE_VOICE.md",
    '''| Live PSTN and Studio browser tests | Native Speech-to-Speech over Twilio SIP / ephemeral WebSocket | `grok-voice-think-fast-2.0`. **`grok-4.6` is not a live-call model.** |
| Direct Speech-to-Speech alias | `wss://api.x.ai/v1/realtime?model=grok-voice-latest` | `grok-voice-latest` aliases `grok-voice-think-fast-2.0`. Wireline pins the versioned id. |''',
    '''| Production PSTN | Native Voice Agent API over Twilio Direct SIP | Provider-bound SIP session. `grok-voice-latest` currently routes to `grok-voice-think-fast-2.0`; the SIP `call_id` join cannot version-pin it. |
| Studio and protected browser tests | Native Speech-to-Speech over an ephemeral WebSocket | Version-pinned `grok-voice-think-fast-2.0`. **`grok-4.6` is not a live-call model.** |
| Direct Speech-to-Speech alias | `wss://api.x.ai/v1/realtime?model=grok-voice-latest` | Moving alias that currently resolves to `grok-voice-think-fast-2.0`. Wireline does not use the alias for browser production tests. |''',
)
replace_exact(
    "docs/GROK_LIVE_VOICE.md",
    '''- Browser and mobile live tests: native xAI Speech-to-Speech using the same `grok-voice-think-fast-2.0` brain as live phone calls. Users do not pick a separate test brain.''',
    '''- Browser and mobile live tests: native xAI Speech-to-Speech pinned to `grok-voice-think-fast-2.0`.''',
)
replace_exact(
    "docs/GROK_LIVE_VOICE.md",
    '''- Production PSTN: Twilio carrier + xAI Direct SIP. Inbound webhooks at `/api/webhooks/xai/voice`. Outbound: Twilio customer leg, then signed `<Sip>` bridge to the tenant's registered xAI number. Grok 4.6 is the xAI Responses API text model for structured work; it is not a Vapi live-call model id.''',
    '''- Production PSTN: Twilio carrier + xAI Direct SIP. Inbound webhooks land at `/api/webhooks/xai/voice`. Outbound calls use a Twilio customer leg and then a signed `<Sip>` bridge to the tenant's registered xAI number. The SIP session is provider-bound and currently runs Think Fast 2.0 through xAI's current voice alias. Grok 4.6 is the structured text model, not a live-call model id.''',
)
replace_exact(
    "docs/GROK_LIVE_VOICE.md",
    '''| Live PSTN + Studio native S2S (`grok-voice-think-fast-2.0` + Eve/Ara/Rex/Sal/Leo) | `XAI_API_KEY` plus `XAI_SIP_ALLOWED_ADDRESSES` | SIP sessions authenticate with the API key. Browsers use minted client secrets. |''',
    '''| Studio native S2S (`grok-voice-think-fast-2.0`) | `XAI_API_KEY` | Server mints a short-lived browser client secret and uses a versioned model URL. |
| Live PSTN over xAI Direct SIP | `XAI_API_KEY` plus `XAI_SIP_ALLOWED_ADDRESSES` | SIP joins authenticate server-side with the API key. The phone session is provider-bound; current xAI routing is Think Fast 2.0. |''',
)
replace_exact(
    "docs/GROK_LIVE_VOICE.md",
    '''- SIP join: `wss://api.x.ai/v1/realtime?call_id=…` (no model query; `session.update` sets the model)''',
    '''- SIP join: `wss://api.x.ai/v1/realtime?call_id=…`
- When `call_id` is present, xAI documents that the `model` query parameter is ignored because the session is bound to the inbound SIP call.
- `session.update` configures instructions, voice, reasoning effort, tools, audio, and turn detection. It does not change or pin the SIP model.''',
)
replace_exact(
    "docs/GROK_LIVE_VOICE.md",
    '''### Why Studio matches the phone brain

Users must test the brain they will ship. Native PSTN and Studio both use `grok-voice-think-fast-2.0`. ChatGPT MCP widget stays OpenAI because it is an OpenAI-hosted surface.''',
    '''### Why Studio still represents the shipped phone behavior

Studio and phone currently use the same Think Fast 2.0 release, the same runtime instructions, tools, voice mapping, and safety policies. The transport distinction remains material: Studio owns a versioned model pin, while PSTN follows the provider-bound phone session and must be recertified if xAI changes the voice alias. ChatGPT MCP widget stays OpenAI because it is an OpenAI-hosted surface.''',
)
replace_exact(
    "docs/GROK_LIVE_VOICE.md",
    '''| Production PSTN | `grok-voice-think-fast-2.0` over Twilio SIP | The agent you ship |
| Studio / mobile live test | `grok-voice-think-fast-2.0` over `wss://api.x.ai/v1/realtime` | Same model, same tools, same Eve/Ara/Rex/Sal/Leo roster |''',
    '''| Production PSTN | xAI SIP voice session, currently Think Fast 2.0 | Provider-bound phone session; monitor and recertify provider alias changes |
| Studio / mobile live test | `grok-voice-think-fast-2.0` over `wss://api.x.ai/v1/realtime` | Wireline-controlled version pin with the same tools and voice mapping |''',
)

replace_exact(
    "tests/security-atomicity-release-contract.test.ts",
    '    const ambiguous = source.indexOf("result.providerOutcomeAmbiguous", provider);',
    '    const ambiguous = source.indexOf("if (isAmbiguousProviderResult(result))", provider);',
)

# Team mutations should refresh only the roster. Re-fetching settings, agents,
# and phone numbers created duplicate load, extra 503 noise, and unrelated UI
# churn after a successful invitation or removal.
replace_exact(
    "src/components/AdminSettings.tsx",
    '''      toastSuccess("Invitation sent", `An invite has been sent to ${email}`);
      fetchData();''',
    '''      toastSuccess("Invitation sent", `An invite has been sent to ${email}`);
      await fetchTeam();''',
)
replace_exact(
    "src/components/AdminSettings.tsx",
    '''      toastSuccess("Member removed", "Team access revoked.");
      fetchData();''',
    '''      toastSuccess("Member removed", "Team access revoked.");
      await fetchTeam();''',
)

write(
    "tests/admin-settings-load-contract.test.ts",
    '''import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/components/AdminSettings.tsx"),
  "utf8",
);

describe("AdminSettings load and roster refresh contract", () => {
  it("loads the team endpoint once on mount", () => {
    const mount = source.slice(
      source.indexOf("useEffect(() =>"),
      source.indexOf("const fetchData = async () =>"),
    );
    const loader = source.slice(
      source.indexOf("const fetchData = async () =>"),
      source.indexOf("const syncCarrierNumbers = async () =>"),
    );

    expect(mount).toContain("fetchTeam();");
    expect(loader).not.toContain('authFetch("/api/team")');
  });

  it("treats the deliberate workspace-certification gate as an empty roster", () => {
    const teamLoader = source.slice(
      source.indexOf("const fetchTeam = async () =>"),
      source.indexOf("const fetchData = async () =>"),
    );

    expect(teamLoader).toContain('payload?.code === "SHARED_WORKSPACES_NOT_CERTIFIED"');
    expect(teamLoader).toContain("setTeamMembers([])");
  });

  it("always releases the primary loading state after an early failed response", () => {
    const loader = source.slice(
      source.indexOf("const fetchData = async () =>"),
      source.indexOf("const syncCarrierNumbers = async () =>"),
    );
    const earlyReturn = loader.indexOf(
      'toastError("Settings unavailable", "Could not load settings. Please refresh.")',
    );
    const finallyBlock = loader.indexOf("} finally {");
    const release = loader.indexOf("setIsLoading(false)", finallyBlock);

    expect(earlyReturn).toBeGreaterThan(-1);
    expect(finallyBlock).toBeGreaterThan(earlyReturn);
    expect(release).toBeGreaterThan(finallyBlock);
  });

  it("refreshes only the team roster after team mutations", () => {
    const invitation = source.slice(
      source.indexOf("const inviteTeamMember"),
      source.indexOf("const removeTeamMember"),
    );
    const removal = source.slice(
      source.indexOf("const removeTeamMember"),
      source.indexOf("const addPhoneNumber"),
    );

    expect(invitation).toContain("await fetchTeam()");
    expect(invitation).not.toContain("fetchData()");
    expect(removal).toContain("await fetchTeam()");
    expect(removal).not.toContain("fetchData()");
  });
});
''',
)

print("Applied final combined-head UI, Admin Settings, voice truth, documentation, lint, metadata, and contract repairs.")
