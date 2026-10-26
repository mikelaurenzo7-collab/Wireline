/* eslint-disable @typescript-eslint/no-explicit-any -- Live tool payloads are vendor-defined JSON envelopes with route-specific shapes. */
import {
  createDraftOrder as shopifyCreateDraftOrder,
  lookupOrder as shopifyLookupOrder,
  searchProducts as shopifySearchProducts,
} from "../shopify-service";
import { assertLiveExternalActionAllowed } from "../account-environment-policy";

import type { ToolCallContext, ToolCallResult } from "../agent-tool-types";

/** Existing-order writes need stronger verification than caller ID. */
const ORDER_CHANGE_TOOLS = new Set([
  "shopify_start_return",
  "shopify_cancel_order",
  "shopify_update_address",
  "shopify_add_order_note",
]);

const ORDER_CHANGE_UNVERIFIED =
  "I can't verify this caller strongly enough to change the order during this call. No change was made. Offer to create a follow-up task so the team can verify the customer and handle the request.";

const LIVE_SHOPIFY_TOOLS = new Set([
  "shopify_lookup_order",
  "shopify_check_inventory",
  "shopify_lookup_customer",
  "shopify_start_return",
  "shopify_cancel_order",
  "shopify_update_address",
  "shopify_create_draft_order",
  "shopify_add_order_note",
]);

export async function handleShopifyToolCall(
  fn: string,
  args: any,
  context: ToolCallContext,
): Promise<ToolCallResult | null> {
  const { agent, toolCallId } = context;

  if (LIVE_SHOPIFY_TOOLS.has(fn)) {
    if (!agent?.user_id) {
      return {
        toolCallId,
        result: "That store action isn't available on this line right now.",
      };
    }
    try {
      await assertLiveExternalActionAllowed(agent.user_id, `vapi_${fn}`);
    } catch {
      return {
        toolCallId,
        result:
          "That store action is disabled in this workspace. Do not claim it ran; offer a manual follow-up.",
      };
    }
  }

  if (ORDER_CHANGE_TOOLS.has(fn)) {
    return { toolCallId, result: ORDER_CHANGE_UNVERIFIED };
  }

  // ──────────────────────────────────────────────────────────────
  //  Shopify e-commerce handlers — order/inventory/customer lookups
  //  and draft checkout for online stores.
  //  Each calls the matching shopify-service function; the service
  //  returns a graceful no-op when no Shopify store is connected,
  //  so these never throw on an un-connected tenant.
  // ──────────────────────────────────────────────────────────────
  if (fn === "shopify_lookup_order") {
    try {
      const { order_number, email } = args || {};
      if (!String(order_number || "").trim() || !String(email || "").trim()) {
        return {
          toolCallId,
          result:
            "Ask the caller for both the order number and the email on the order before looking it up.",
        };
      }
      const order = await shopifyLookupOrder({
        orderNumber: order_number,
        email,
        userId: agent?.user_id,
      });
      if (!order) {
        return {
          toolCallId,
          result:
            "I couldn't verify an order with that number and email. Ask the caller to check both or offer a team follow-up.",
        };
      }
      const trackingLine =
        order.tracking.length > 0 && order.tracking[0].number
          ? ` Tracking: ${order.tracking[0].company || "carrier"} ${order.tracking[0].number}.`
          : " No tracking number yet.";
      const itemList = order.line_items.map((li) => `${li.quantity}x ${li.title}`).join(", ");
      return {
        toolCallId,
        result: `Order ${order.name}: ${order.fulfillment_status}, payment ${order.financial_status}, total ${order.total} ${order.currency}.${trackingLine} Items: ${itemList}.`,
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
                `${vr.title}, $${vr.price}, ${vr.inventory_quantity > 0 ? `${vr.inventory_quantity} in stock` : "out of stock"}`,
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
          "The catalog lookup failed. No follow-up task was saved. Offer to create one with create_followup_task; confirm it only after the tool succeeds.",
      };
    }
  }

  if (fn === "shopify_lookup_customer") {
    return {
      toolCallId,
      result:
        "I can't verify a customer profile from caller ID alone, so no account details were shared. Offer to look up a specific order with its number and email, or create a team follow-up.",
    };
  }

  if (fn === "shopify_create_draft_order") {
    try {
      const handlerArgs = args || {};
      const variantId = String(handlerArgs.variant_id ?? "").trim();
      const qty = handlerArgs.quantity;
      if (!/^[1-9]\d{0,15}$/.test(variantId) || !Number.isSafeInteger(Number(variantId))) {
        return {
          toolCallId,
          result:
            "I need a real catalog variant before creating a draft. Check inventory first; no draft was created.",
        };
      }
      if (typeof qty !== "number" || !Number.isInteger(qty) || qty < 1 || qty > 20) {
        return {
          toolCallId,
          result: "Choose a whole-number quantity from 1 to 20. No draft was created.",
        };
      }
      const outcome = await shopifyCreateDraftOrder({
        lineItems: [{ variantId, quantity: qty }],
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
          "The draft order was not confirmed. Ask the owner to check the store before another attempt. No follow-up task was saved. Offer to create one with create_followup_task.",
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
        "No discount was applied. Offer to create a follow-up task for the owner to review the request; confirm it only after the tool succeeds.",
    };
  }

  return null;
}
