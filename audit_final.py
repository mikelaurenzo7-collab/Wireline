import os
import re

dirs = ['/app/src/components', '/app/src/pages', '/app/src/lib', '/app/src/routes', '/app/src/db']

vapi_count = 0

for root, _, files in os.walk('/app/src'):
    for file in files:
        if not file.endswith('.tsx') and not file.endswith('.ts'):
            continue
        filepath = os.path.join(root, file)
        try:
            with open(filepath, 'r') as f:
                content = f.read()

            # Client facing UI check - look for 'Vapi' or 'vapi' NOT part of a variable/key
            # like vapi_call_id, VAPI_, etc.
            # Very rudimentary check to ensure we didn't miss something obvious in the rendered text
            if "Vapi" in content and "vapi_" not in content and "VAPI_" not in content:
                # Need to be careful here, backend files will still have Vapi
                pass
                
        except Exception as e:
            pass

