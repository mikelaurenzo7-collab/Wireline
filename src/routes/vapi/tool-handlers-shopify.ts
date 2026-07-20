/* eslint-disable @typescript-eslint/no-explicit-any -- Vapi webhook/tool payloads are vendor-defined JSON envelopes with route-specific shapes. */
import {
  addOrderNote as shopifyAddOrderNote,
  cancelOrder as shopifyCancelOrder,
  createDraftOrder as shopifyCreateDraftOrder,
  lookupCustomer as shopifyLookupCustomer,
  lookupOrder as shopifyLookupOrder,
  searchProducts as shopifySearchProducts,
  startReturn as shopifyStartReturn,
  updateOrderShippingAddress as shopifyUpdateAddress,
} from "../../lib/shopify-service";

import type { ToolCallContext, ToolCallResult } from "./types";

export async function handleShopifyToolCall(
  fn: string,
  args: any,
  context: ToolCallContext,
): Promise<ToolCallResult | null> {
  const { agent, message, payload, toolCallId } = context;

  // ──────────────────────────────────────────────────────────────
  //  Shopify e-commerce handlers — order/inventory/customer
  //  lookups + return/cancel/address actions for online stores.
  //  Each calls the matching shopify-service function; the service
  //  returns a graceful no-op when no Shopify store is connected,
  //  so these never throw on an un-connected tenant.
  // ──────────────────────────────────────────────────────────────
  if (fn === "shopify_lookup_order") {
    try {
      const { order_number, email } = args || {};
      const order = await shopifyLookupOrder({
        orderNumber: order_number,
        email,
        userId: agent?.user_id,
      });
      if (!order) {
        return {
          toolCallId,
          result:
            "I couldn't find an order matching that. Double-check the order number or the email on the order.",
        };
      }
      const trackingLine =
        order.tracking.length > 0 && order.tracking[0].number
          ? ` Tracking: ${order.tracking[0].company || "carrier"} ${order.tracking[0].number}.`
          : " No tracking number yet.";
      const itemList = order.line_items.map((li) => `${li.quantity}x ${li.title}`).join(", ");
      return {
        toolCallId,
        result: `Order ${order.name}: ${order.fulfillment_status}, payment ${order.financial_status}, total ${order.total} ${order.currency}.${trackingLine} Items: ${itemList}. [data: ${JSON.stringify(order)}]`,
      };
    } catch {
      return {
        toolCallId,
        result:
          "I'm having trouble looking up that order right now. Can you double-check the order number?",
      };
    }
  }

  if (fn === "shopify_check_inventory") {
    try {
      const { query } = args || {};
      const products = await shopifySearchProducts({
        query: String(query || ""),
        userId: agent?.user_id,
      });
      if (products.length === 0) {
        return {
          toolCallId,
          result: "I couldn't find a product matching that in the store catalog.",
        };
      }
      const summary = products
        .slice(0, 5)
        .map((p) => {
          const v = p.variants
            .map(
              (vr) =>
                `${vr.title} — $${vr.price}, ${vr.inventory_quantity > 0 ? `${vr.inventory_quantity} in stock` : "out of stock"}`,
            )
            .join("; ");
          return `${p.title}: ${v}`;
        })
        .join(" | ");
      return {
        toolCallId,
        result: `Found ${products.length} product(s). ${summary} [data: ${JSON.stringify(products)}]`,
      };
    } catch {
      return {
        toolCallId,
        result:
          "I'm having trouble checking the catalog right now. Let me take your info and have someone look into it.",
      };
    }
  }

  if (fn === "shopify_lookup_customer") {
    try {
      const { email, phone } = args || {};
      const fallbackNumber =
        (payload.call as { customer?: { number?: string } } | undefined)?.customer?.number ||
        (message.call as { customer?: { number?: string } } | undefined)?.customer?.number;
      const customer = await shopifyLookupCustomer({
        email,
        phone: phone || fallbackNumber,
        userId: agent?.user_id,
      });
      if (!customer) {
        return {
          toolCallId,
          result: "I couldn't find a customer record matching that email or phone number.",
        };
      }
      const recent = customer.recent_orders
        .map((o) => `${o.name} (${o.financial_status}, ${o.total})`)
        .join(", ");
      return {
        toolCallId,
        result: `Customer ${customer.first_name} ${customer.last_name}: ${customer.orders_count} order(s), ${customer.total_spent} lifetime. Recent: ${recent || "none"}. [data: ${JSON.stringify(customer)}]`,
      };
    } catch {
      return {
        toolCallId,
        result:
          "I'm having trouble looking up your account right now. Can I get your name and I'll have someone call you back?",
      };
    }
  }

  if (fn === "shopify_start_return") {
    try {
      const { order_id, reason } = args || {};
      if (!order_id) {
        return {
          toolCallId,
          result: "I need the order ID to start a return. Look up the order first.",
        };
      }
      const outcome = await shopifyStartReturn({
        orderId: String(order_id),
        reason: String(reason || "customer request"),
        userId: agent?.user_id,
      });
      return { toolCallId, result: outcome.message };
    } catch {
      return {
        toolCallId,
        result:
          "I ran into a hiccup starting that return. Let me note the details and have someone process it for you.",
      };
    }
  }

  if (fn === "shopify_cancel_order") {
    try {
      const { order_id } = args || {};
      if (!order_id) {
        return {
          toolCallId,
          result: "I need the order ID to cancel an order. Look up the order first.",
        };
      }
      const outcome = await shopifyCancelOrder({
        orderId: String(order_id),
        userId: agent?.user_id,
      });
      return { toolCallId, result: outcome.message };
    } catch {
      return {
        toolCallId,
        result:
          "I ran into a hiccup cancelling that order. Let me note it and have someone take care of it.",
      };
    }
  }

  if (fn === "shopify_update_address") {
    try {
      const handlerArgs = args || {};
      if (!handlerArgs.order_id) {
        return {
          toolCallId,
          result: "I need the order ID to update the shipping address.",
        };
      }
      const outcome = await shopifyUpdateAddress({
        orderId: String(handlerArgs.order_id),
        address: {
          address1: handlerArgs.address1,
          address2: handlerArgs.address2,
          city: handlerArgs.city,
          province: handlerArgs.province,
          zip: handlerArgs.zip,
          country: handlerArgs.country,
          name: handlerArgs.name,
        },
        userId: agent?.user_id,
      });
      return { toolCallId, result: outcome.message };
    } catch {
      return {
        toolCallId,
        result:
          "I wasn't able to update the address right now. Let me note the new address and have someone update it.",
      };
    }
  }

  if (fn === "shopify_create_draft_order") {
    try {
      const handlerArgs = args || {};
      const qty = Number(handlerArgs.quantity) || 1;
      const outcome = await shopifyCreateDraftOrder({
        lineItems: [
          handlerArgs.variant_id
            ? { variantId: String(handlerArgs.variant_id), quantity: qty }
            : {
                title: String(handlerArgs.product_title || "Phone order item"),
                price: String(handlerArgs.price || "0.00"),
                quantity: qty,
              },
        ],
        customer: handlerArgs.customer_email
          ? {
              email: String(handlerArgs.customer_email),
              first_name: handlerArgs.customer_first_name,
              last_name: handlerArgs.customer_last_name,
            }
          : undefined,
        userId: agent?.user_id,
      });
      const link = outcome.invoiceUrl ? ` Payment link: ${outcome.invoiceUrl}` : "";
      return { toolCallId, result: `${outcome.message}${link}` };
    } catch {
      return {
        toolCallId,
        result:
          "I wasn't able to create the order right now. Let me take your details and have someone process it.",
      };
    }
  }

  if (fn === "shopify_add_order_note") {
    try {
      const { order_id, note } = args || {};
      if (!order_id) {
        return { toolCallId, result: "I need the order ID to add a note." };
      }
      const outcome = await shopifyAddOrderNote({
        orderId: String(order_id),
        note: String(note || ""),
        userId: agent?.user_id,
      });
      return { toolCallId, result: outcome.message };
    } catch {
      return {
        toolCallId,
        result: "I wasn't able to add that note right now, but I've noted the details.",
      };
    }
  }

  if (fn === "shopify_apply_discount") {
    // Not wired to the Shopify Admin API. Never tell the caller the discount was
    // applied — that would be customer-facing misinformation (no discount is
    // created). Offer human follow-up instead, like square_send_invoice does.
    const { order_number, discount_code } = args || {};
    void order_number;
    void discount_code;
    return {
      toolCallId,
      result:
        "I can't apply a discount to an order directly on this line. Let me take the details and have the team apply it and follow up to confirm.",
    };
  }

  return null;
}
