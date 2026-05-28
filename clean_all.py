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

            # The exact replacements
            content = content.replace('#4F1E7B', '#0A0A0A')
            content = content.replace('#3B154C', '#000000')
            content = content.replace('#6a25a3', '#1A1A1A')
            content = content.replace('79, 30, 123', '0, 0, 0')
            content = content.replace('79,30,123', '0,0,0')
            
            with open(filepath, 'w') as f:
                f.write(content)
        except Exception as e:
            pass

