with open("src/routes/vapi/tool-handlers-shopify.ts", "r") as f:
    content = f.read()
content = content.replace("const { order_number, discount_code } = args || {};", "const { order_number, discount_code } = args || {};\n      // ignore unused vars for now by doing something with them\n      void order_number; void discount_code;")
with open("src/routes/vapi/tool-handlers-shopify.ts", "w") as f:
    f.write(content)
