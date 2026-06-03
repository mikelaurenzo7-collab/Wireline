with open("src/lib/workspace-planner.ts", "r") as f:
    content = f.read()

content = content.replace(
    'use "true" or "false".",',
    'use \'true\' or \'false\'.",'
)

with open("src/lib/workspace-planner.ts", "w") as f:
    f.write(content)
