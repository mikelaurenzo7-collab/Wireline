import urllib.request
import json
import ssl
import time

vapi_key = "caaa9f6b-7eb2-4b63-80f4-dd3c007e815c"
# Yesterday's perfect call ID
yesterday_call_id = "019ea4ca-dfe7-7443-a2cd-23455b511bc5"
# Swapped working number ID: +12052364978
phone_number_id = "6e8db80d-2514-4e44-8e98-eb98475164e0"
customer_number = "+16306700969"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

try:
    print(f"Fetching assistant configuration from yesterday's call ({yesterday_call_id})...")
    req_get = urllib.request.Request(
        f"https://api.vapi.ai/call/{yesterday_call_id}",
        headers={
            "Authorization": f"Bearer {vapi_key}",
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0"
        }
    )
    with urllib.request.urlopen(req_get, context=ctx) as res_get:
        call_info = json.loads(res_get.read().decode())
        assistant_config = call_info.get("assistant")
        
    if not assistant_config:
        print("Error: Could not find assistant configuration in yesterday's call.")
    else:
        # Clean read-only keys
        read_only_keys = ["id", "orgId", "createdAt", "updatedAt"]
        for key in read_only_keys:
            assistant_config.pop(key, None)
            
        # Place the call
        payload = {
            "phoneNumberId": phone_number_id,
            "customer": {"number": customer_number},
            "assistant": assistant_config
        }
        
        print(f"Triggering outbound call using cloned settings to {customer_number}...")
        req_post = urllib.request.Request(
            "https://api.vapi.ai/call/phone",
            headers={
                "Authorization": f"Bearer {vapi_key}",
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0"
            },
            data=json.dumps(payload).encode()
        )
        
        with urllib.request.urlopen(req_post, context=ctx) as res_post:
            post_info = json.loads(res_post.read().decode())
            new_call_id = post_info.get("id")
            print(f"Call placed successfully! Call ID: {new_call_id}")
            
        print("Polling call status for 30 seconds...")
        for i in range(10):
            time.sleep(3)
            req_status = urllib.request.Request(
                f"https://api.vapi.ai/call/{new_call_id}",
                headers={
                    "Authorization": f"Bearer {vapi_key}",
                    "User-Agent": "Mozilla/5.0"
                }
            )
            try:
                with urllib.request.urlopen(req_status, context=ctx) as res_status:
                    status_info = json.loads(res_status.read().decode())
                    status = status_info.get("status")
                    ended_reason = status_info.get("endedReason")
                    print(f"  [{i+1}] Status: {status} | Ended Reason: {ended_reason}")
                    if status == "ended":
                        break
            except Exception as pe:
                print("  Polling error:", pe)
                
except Exception as err:
    print("Error:", err)
