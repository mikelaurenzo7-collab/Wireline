from pathlib import Path

path = Path(".audit/postmerge/finalize.py")
text = path.read_text(encoding="utf-8")
old = '''activation_path = "src/lib/voice/xai-phone-activation-service.ts"
activation = read(activation_path)
legacy_cast = "const client = getTwilioClient() as any;"
if activation.count(legacy_cast) != 2:
    raise RuntimeError("expected exactly two legacy Twilio client casts")
write(activation_path, activation.replace(legacy_cast, "const client = getTwilioClient();"))
'''
new = '''activation_path = "src/lib/voice/xai-phone-activation-service.ts"
activation = read(activation_path)
legacy_cast = "const client = getTwilioClient() as any;"
legacy_cast_count = activation.count(legacy_cast)
if legacy_cast_count not in (0, 2):
    raise RuntimeError(
        f"expected zero or two legacy Twilio client casts, found {legacy_cast_count}"
    )
if legacy_cast_count:
    write(activation_path, activation.replace(legacy_cast, "const client = getTwilioClient();"))
'''
if text.count(old) != 1:
    raise RuntimeError("finalizer Twilio-cast block was not found exactly once")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
print("Prepared combined-head finalizer for typed native activation service.")
