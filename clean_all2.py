import os
import re

dirs = ['/app/src/components', '/app/src/pages']

for root, _, files in os.walk('/app/src'):
    for file in files:
        if not file.endswith('.tsx') and not file.endswith('.ts'):
            continue
        filepath = os.path.join(root, file)
        try:
            with open(filepath, 'r') as f:
                content = f.read()

            content = content.replace('real Vapi transcripts', 'real transcripts')
            content = content.replace("Vapi's default speed", "Voice Engine's default speed")
            content = content.replace('The Vapi assistant factory reads', 'The Voice Engine factory reads')
            content = content.replace('(via Vapi destination)', '(via Voice Engine destination)')
            content = content.replace("via Vapi's assistant API", "via Voice Engine's API")
            content = content.replace("Vapi rejects duplicate selection", "Voice Engine rejects duplicate selection")

            with open(filepath, 'w') as f:
                f.write(content)
        except Exception as e:
            pass

