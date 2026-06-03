with open("src/routes/agent-workspace-routes.ts", "r") as f:
    content = f.read()

content = content.replace(
    'if (spec.kind === "vibe") {\n        value = value.toLowerCase();\n        if (!(WORKSPACE_VIBE_OPTIONS as readonly string[]).includes(value)) {',
    'if (spec.kind === "vibe") {\n        value = String(value).toLowerCase();\n        if (!(WORKSPACE_VIBE_OPTIONS as readonly string[]).includes(value as string)) {'
)

with open("src/routes/agent-workspace-routes.ts", "w") as f:
    f.write(content)
