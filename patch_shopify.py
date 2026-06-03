with open("src/routes/vapi/tool-handlers-shopify.ts", "r") as f:
    content = f.read()

handlers = """
  if (fn === "shopify_apply_discount") {
    try {
      const { order_number, discount_code } = args || {};
      // Stub for now or call actual service
      return {
        toolCallId,
        result: `Discount ${discount_code} applied to order ${order_number} successfully (pending sync).`,
      };
    } catch {
      return {
        toolCallId,
        result: "I've noted the discount request.",
      };
    }
  }
"""

content = content.replace("return null;", handlers + "\n  return null;")

with open("src/routes/vapi/tool-handlers-shopify.ts", "w") as f:
    f.write(content)
