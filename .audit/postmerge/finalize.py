from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, value: str) -> None:
    Path(path).write_text(value, encoding="utf-8")


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

print("Applied final combined-head lint and syntax repairs.")
