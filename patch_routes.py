with open("src/routes/agent-workspace-routes.ts", "r") as f:
    content = f.read()

content = content.replace(
    'let value = rawValue.trim().slice(0, spec.maxLen);',
    'let value: string | boolean = rawValue.trim().slice(0, spec.maxLen);\n      if (spec.kind === "boolean") {\n        value = value.toLowerCase() === "true";\n      }'
)

content = content.replace(
    '} else if (spec.kind === "phone" && !/^[+\\d][\\d\\s()-]{5,19}$/.test(value)) {',
    '} else if (spec.kind === "phone" && typeof value === "string" && !/^[+\\d][\\d\\s()-]{5,19}$/.test(value)) {'
)
content = content.replace(
    '} else if (spec.kind === "email" && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value)) {',
    '} else if (spec.kind === "email" && typeof value === "string" && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value)) {'
)
content = content.replace(
    '} else if (spec.kind === "url" && typeof value === "string" && !/^https?:\\/\\//.test(value)) {\n        return res.status(400).json({ error: "That doesn\'t look like a valid URL." });\n      }',
    ''
) # just in case

# add url check
content = content.replace(
    'return res.status(400).json({ error: "That doesn\'t look like a valid phone number." });\n      }',
    'return res.status(400).json({ error: "That doesn\'t look like a valid phone number." });\n      } else if (spec.kind === "url" && typeof value === "string" && !/^https?:\\/\\//.test(value)) {\n        return res.status(400).json({ error: "That doesn\'t look like a valid URL." });\n      }'
)

with open("src/routes/agent-workspace-routes.ts", "w") as f:
    f.write(content)
