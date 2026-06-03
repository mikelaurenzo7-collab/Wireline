with open("src/routes/vapi/tool-handlers-square.ts", "r") as f:
    content = f.read()
content = content.replace("const { email, amount, description } = args || {};", "const { email, amount, description: _description } = args || {};")
with open("src/routes/vapi/tool-handlers-square.ts", "w") as f:
    f.write(content)
