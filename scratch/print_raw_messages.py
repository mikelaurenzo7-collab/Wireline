import urllib.request
import json
import ssl
import sys

if sys.platform.startswith("win"):
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

vapi_key = "caaa9f6b-7eb2-4b63-80f4-dd3c007e815c"
call_id = "019ea9bd-b79e-7ff4-8fb9-1faf7d3fb121"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

try:
    req = urllib.request.Request(
        f"https://api.vapi.ai/call/{call_id}",
        headers={
            "Authorization": f"Bearer {vapi_key}",
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0"
        }
    )
    with urllib.request.urlopen(req, context=ctx) as res:
        call_info = json.loads(res.read().decode())
        messages = call_info.get("messages", [])
        
        print(f"Total messages: {len(messages)}")
        # Print the raw JSON of the last 10 messages
        for idx in range(max(0, len(messages) - 10), len(messages)):
            print(f"\n--- Message {idx+1} ---")
            print(json.dumps(messages[idx], indent=2))
            
except Exception as err:
    print("Error:", err)
