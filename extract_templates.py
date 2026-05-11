import re

def extract_templates():
    with open('server.ts', 'r', encoding='utf-8') as f:
        content = f.read()
    
    match = re.search(r'(const ROLE_PERSONALITY_TEMPLATES.*?^});', content, re.MULTILINE | re.DOTALL)
    if not match:
        print("Not found")
        return
        
    block = match.group(1)
    
    # write to src/lib/agent-constants.ts
    with open('src/lib/agent-constants.ts', 'w', encoding='utf-8') as f:
        f.write('export ' + block + '\n')
        
    # remove from server.ts
    new_content = content.replace(block, "import { ROLE_PERSONALITY_TEMPLATES } from './src/lib/agent-constants';")
    with open('server.ts', 'w', encoding='utf-8') as f:
        f.write(new_content)
        
    print("Extracted templates")

extract_templates()
