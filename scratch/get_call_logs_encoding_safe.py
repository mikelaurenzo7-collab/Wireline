import urllib.request
import json
import ssl
import sys

# Set encoding to utf-8 for standard output to prevent charmap errors on emojis
if sys.platform.startswith("win"):
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

vapi_key = "caaa9f6b-7eb2-4b63-80f4-dd3c007e815c"
call_id = "019ea9bd-b79e-7ff4-8fb9-1faf7d3fb121"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

try:
    print(f"Fetching detailed logs for call {call_id}...")
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
        
        print("\n=== Call Overview ===")
        print("Status:", call_info.get("status"))
        print("Ended Reason:", call_info.get("endedReason"))
        
        print("\n=== Detailed Message Sequence ===")
        messages = call_info.get("messages", [])
        print(f"Total messages recorded: {len(messages)}")
        for idx, m in enumerate(messages):
            role = m.get("role")
            message_type = m.get("type")
            sec = m.get('secondsFromStart', 0)
            role_str = str(role).upper() if role else "UNKNOWN_ROLE"
            type_str = str(message_type).upper() if message_type else "UNKNOWN_TYPE"
            
            if message_type == "transcript" or role in ["user", "assistant"]:
                print(f"[{idx+1}] {role_str} ({sec:.1f}s): {m.get('transcript') or m.get('message')}")
            elif message_type == "tool-calls":
                print(f"[{idx+1}] TOOL CALL ({sec:.1f}s): {m.get('toolCalls')}")
            elif message_type == "tool-call-result":
                print(f"[{idx+1}] TOOL RESULT ({sec:.1f}s): {m.get('result')}")
            elif message_type == "speech-update":
                print(f"[{idx+1}] SPEECH UPDATE ({sec:.1f}s): Status={m.get('status')} | Text={m.get('text')}")
            elif role == "system" or message_type == "event":
                print(f"[{idx+1}] SYSTEM/EVENT ({sec:.1f}s): {m.get('message') or m.get('event') or m}")
            else:
                print(f"[{idx+1}] {type_str} ({sec:.1f}s): {m}")
            print("-" * 50)
            
except Exception as err:
    print("Error:", err)
