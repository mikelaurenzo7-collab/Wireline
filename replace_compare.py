import re

with open('/app/src/pages/Compare.tsx', 'r') as f:
    content = f.read()

# Remove vapi column from Row interface
content = re.sub(r'\s*vapi:\s*Cell;', '', content)

# Remove vapi: true|false|"partial", from ROWS
content = re.sub(r'\s*vapi:\s*(true|false|"partial"),', '', content)

# Remove the "Roll-your-own Vapi stack" feature entirely
vapi_row_regex = r'\s*\{\s*feature:\s*"Roll-your-own Vapi stack"[\s\S]*?\},'
content = re.sub(vapi_row_regex, '', content)

# Remove from COMPETITORS
content = re.sub(r'\s*\{\s*key:\s*"vapi",\s*label:\s*"Vapi \(DIY\)"[^}]*\},', '', content)

# Replace titles and descriptions
content = content.replace('Wireline vs Air / Synthflow / Bland / Vapi / Retell', 'Wireline vs Air / Synthflow / Bland / Retell')
content = content.replace('Bland, Vapi direct, and Retell', 'Bland, and Retell')
content = content.replace('; Vapi (direct) wins when you are building your own product on primitives', '')
content = content.replace('Vapi (direct) wins when you are building your own product on primitives.', '')

# Remove the "Pick Vapi (DIY) if" block
vapi_pick_regex = r'\s*<div[^>]*>\s*<p[^>]*>\s*Pick Vapi \(DIY\) if\s*</p>\s*<p[^>]*>[\s\S]*?</p>\s*</div>'
content = re.sub(vapi_pick_regex, '', content)

with open('/app/src/pages/Compare.tsx', 'w') as f:
    f.write(content)
