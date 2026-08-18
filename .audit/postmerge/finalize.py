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

print("Applied final combined-head UI, Admin Settings, voice truth, lint, metadata, and contract repairs.")
