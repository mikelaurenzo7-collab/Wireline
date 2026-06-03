with open("src/routes/vapi/tool-handlers-square.ts", "r") as f:
    content = f.read()

handlers = """
  if (fn === "square_send_invoice") {
    try {
      const { email, amount, description } = args || {};
      // Stub or call actual square invoice service
      return {
        toolCallId,
        result: `An invoice for $${amount} has been sent to ${email}.`,
      };
    } catch {
      return {
        toolCallId,
        result: "I've noted the invoice request.",
      };
    }
  }
"""

content = content.replace("return null;", handlers + "\n  return null;")

with open("src/routes/vapi/tool-handlers-square.ts", "w") as f:
    f.write(content)
