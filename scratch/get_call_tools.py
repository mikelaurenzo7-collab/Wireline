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
        
        print("=== Analyzing Tool Calls & Events ===")
        for idx, m in enumerate(messages):
            message_type = m.get("type")
            sec = m.get('secondsFromStart', 0)
            
            # Print only tool calls, tool results, and related events
            if message_type in ["tool-calls", "tool-call-result", "event", "call-log"]:
                print(f"[{idx+1}] Type: {message_type} ({sec:.1f}s)")
                if message_type == "tool-calls":
                    calls = m.get("toolCalls", [])
                    for tc in calls:
                        print(f"  Tool Name: {tc.get('function', {}).get('name')}")
                        print(f"  Arguments: {tc.get('function', {}).get('arguments')}")
                elif message_type == "tool-call-result":
                    print(f"  Result: {m.get('result')}")
                elif message_type == "event":
                    print(f"  Event: {m.get('event')} | Message: {m.get('message')}")
                print("-" * 50)
                
except Exception as err:
    print("Error:", err)
