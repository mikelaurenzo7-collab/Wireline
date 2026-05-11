import sys
import re

def extract_routes(filepath, route_patterns, output_file):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    lines = content.splitlines()
    new_server_lines = []
    extracted_routes_content = []
    
    i = 0
    while i < len(lines):
        line = lines[i]
        
        # Check if line matches any of the route patterns
        match = None
        for pattern in route_patterns:
            if re.search(pattern, line):
                match = pattern
                break
                
        if match:
            # We found a route. Now find its end by balancing braces.
            route_block = []
            brace_count = 0
            started = False
            
            while i < len(lines):
                current_line = lines[i]
                route_block.append(current_line)
                
                if '{' in current_line:
                    started = True
                    brace_count += current_line.count('{')
                if '}' in current_line:
                    brace_count -= current_line.count('}')
                    
                if started and brace_count == 0:
                    # Make sure we didn't just close an inline object before the main route body.
                    # Usually the route ends with '});'
                    if '});' in current_line or '}' == current_line.strip():
                         break
                    
                i += 1
                
            extracted_routes_content.append('\n'.join(route_block) + '\n')
            
            # If the route we just extracted is the first one, insert the router mount
            # wait, we will just mount the router manually later.
        else:
            new_server_lines.append(line)
            
        i += 1

    # Write the extracted routes to the new file
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write('import { Router } from "express";\n')
        f.write('const router = Router();\n\n')
        for block in extracted_routes_content:
            # Replace app. with router.
            block = re.sub(r'app\.(get|post|put|patch|delete)\(', r'router.\1(', block)
            f.write(block)
            f.write('\n')
        f.write('\nexport default router;\n')

    # Write the modified server.ts back
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write('\n'.join(new_server_lines) + '\n')

agent_patterns = [
    r'app\.(get|post|put|patch|delete)\([\'"]/api/agents',
    r'app\.(get|post|put|patch|delete)\([\'"]/api/agent-config'
]

extract_routes('server.ts', agent_patterns, 'src/routes/agent-routes.ts')
print("Extracted agent routes.")
