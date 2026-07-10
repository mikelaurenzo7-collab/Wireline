/* eslint-disable @typescript-eslint/no-explicit-any -- Vapi webhook/tool payloads are vendor-defined JSON envelopes with route-specific shapes. */
import {
  squareCheckInventory,
  squareCreatePaymentLink,
  squareLookupCustomer,
  squareLookupOrder,
} from "../../lib/square-service";

import type { ToolCallContext, ToolCallResult } from "./types";

export async function handleSquareToolCall(
  fn: string,
  args: any,
  context: ToolCallContext,
): Promise<ToolCallResult | null> {
  const { agent, message, payload, toolCallId } = context;

  // ──────────────────────────────────────────────────────────────
  //  Square e-commerce handlers — order/customer/inventory lookups
  //  and payment-link creation for Square merchants.
  // ──────────────────────────────────────────────────────────────
  if (fn === "square_lookup_order") {
    try {
      const { order_id, email } = args || {};
      const order = await squareLookupOrder({
        orderId: order_id,
        email,
        userId: agent?.user_id,
      });
      if (!order) {
        return {
          toolCallId,
          result:
            "I couldn't find a Square order matching that. Double-check the order ID or the email on the account.",
        };
      }
      const itemList = order.lineItems.map((lineItem) => `${lineItem.quantity}x ${lineItem.name}`).join(", ");
      return {
        toolCallId,
        result: `Order ${order.displayId || order.id}: state ${order.state}, total ${order.total}. Items: ${itemList}. [data: ${JSON.stringify(order)}]`,
      };
    } catch {
      return {
        toolCallId,
        result:
          "I'm having trouble looking up that order right now. Can you double-check the order ID?",
      };
    }
  }

  if (fn === "square_lookup_customer") {
    try {
      const { email, phone } = args || {};
      const fallbackNumber =
        (payload.call as { customer?: { number?: string } } | undefined)?.customer?.number ||
        (message.call as { customer?: { number?: string } } | undefined)?.customer?.number;
      const customer = await squareLookupCustomer({
        email,
        phone: phone || fallbackNumber,
        userId: agent?.user_id,
      });
      if (!customer) {
        return {
          toolCallId,
          result: "I couldn't find a Square customer matching that email or phone number.",
        };
      }
      return {
        toolCallId,
        result: `Customer ${customer.firstName} ${customer.lastName} (${customer.email ?? "no email"}): member since ${customer.createdAt.split("T")[0]}. [data: ${JSON.stringify(customer)}]`,
      };
    } catch {
      return {
        toolCallId,
        result:
          "I'm having trouble looking up your account right now. Can I get your name and have someone follow up?",
      };
    }
  }

  if (fn === "square_check_inventory") {
    try {
      const { query } = args || {};
      const items = await squareCheckInventory({
        query: String(query || ""),
        userId: agent?.user_id,
      });
      if (items.length === 0) {
        return {
          toolCallId,
          result: "I couldn't find a Square catalog item matching that.",
        };
      }
      const summary = items
        .slice(0, 5)
        .map((item) => {
          const inStock = item.variations.some((variation) => (variation.stockCount ?? 0) > 0);
          return `${item.name}: ${item.variations.map((variation) => `${variation.name} ${variation.price}`).join(", ")} — ${inStock ? "in stock" : "out of stock"}`;
        })
        .join(" | ");
      return {
        toolCallId,
        result: `Found ${items.length} item(s). ${summary} [data: ${JSON.stringify(items)}]`,
      };
    } catch {
      return {
        toolCallId,
        result:
          "I'm having trouble checking the catalog right now. Let me take down what you're looking for.",
      };
    }
  }

  if (fn === "square_create_payment_link") {
    try {
      const { title, amount_dollars } = args || {};
      if (!title || amount_dollars == null) {
        return {
          toolCallId,
          result: "I need a title and amount to create a payment link.",
        };
      }
      const link = await squareCreatePaymentLink({
        title: String(title),
        amountCents: Math.round(Number(amount_dollars) * 100),
        userId: agent?.user_id,
      });
      if (!link.ok || !link.url) {
        return { toolCallId, result: link.message };
      }
      return {
        toolCallId,
        result: `Payment link created: ${link.url} — $${amount_dollars} for ${title}. Share this with the customer to complete payment. [data: ${JSON.stringify(link)}]`,
      };
    } catch {
      return {
        toolCallId,
        result:
          "I wasn't able to create the payment link right now. I'll have someone send it to you directly.",
      };
    }
  }

  if (fn === "square_send_invoice") {
    const { email, amount, description } = args || {};
    return {
      toolCallId,
      result: [
        "I cannot confirm that an invoice was sent because direct Square invoice delivery is not enabled.",
        email ? `Invoice recipient requested: ${email}.` : null,
        amount != null ? `Amount requested: $${amount}.` : null,
        description ? `Description: ${description}.` : null,
        "I can create a verified Square payment link now, or record this invoice request for the account holder to approve and send.",
      ]
        .filter(Boolean)
        .join(" "),
    };
  }

  return null;
}
