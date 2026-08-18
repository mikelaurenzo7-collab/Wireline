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
    "tests/security-atomicity-release-contract.test.ts",
    '    const ambiguous = source.indexOf("result.providerOutcomeAmbiguous", provider);',
    '    const ambiguous = source.indexOf("if (isAmbiguousProviderResult(result))", provider);',
)

print("Applied final combined-head UI, lint, metadata, and contract repairs.")
