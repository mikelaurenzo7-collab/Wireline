import urllib.request
import json
import ssl
import urllib.error

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
        print("Duration:", call_info.get("duration"), "seconds")
        
        print("\n=== Transcript ===")
        print(call_info.get("transcript"))
        
        print("\n=== Detailed Message Sequence ===")
        messages = call_info.get("messages", [])
        print(f"Total messages recorded: {len(messages)}")
        for idx, m in enumerate(messages):
            role = m.get("role")
            message_type = m.get("type")
            # Print user and assistant messages, plus interruptions/events
            if message_type == "transcript" or role in ["user", "assistant"]:
                print(f"[{idx+1}] {role.upper()} ({m.get('secondsFromStart')}s): {m.get('transcript') or m.get('message')}")
            elif message_type == "event" or role == "system":
                print(f"[{idx+1}] SYSTEM/EVENT ({m.get('secondsFromStart')}s): {m}")
            else:
                print(f"[{idx+1}] {message_type.upper()} ({m.get('secondsFromStart')}s): {m}")
            print("-" * 30)
            
except Exception as err:
    print("Error:", err)
