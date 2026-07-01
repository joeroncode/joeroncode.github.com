import crypto from "node:crypto";
import { OrderChannel, POSProvider, type NormalizedPOSOrder, type POSAdapter } from "@ordercheck/shared";

interface SquareOrderLineItem {
  uid?: string;
  catalog_object_id?: string;
  name: string;
  quantity: string;
  modifiers?: Array<{ name: string }>;
  note?: string;
}

interface SquareOrderObject {
  id: string;
  location_id: string;
  fulfillments?: Array<{ type: string; pickup_details?: { recipient?: { display_name?: string } } }>;
  line_items?: SquareOrderLineItem[];
}

interface SquareOrderPayload {
  type: string;
  data?: {
    object?: {
      order?: SquareOrderObject;
    };
  };
}

function mapFulfillmentToChannel(type: string | undefined): OrderChannel {
  switch (type) {
    case "DELIVERY":
      return OrderChannel.DELIVERY;
    case "PICKUP":
      return OrderChannel.TAKEOUT;
    default:
      return OrderChannel.DINE_IN;
  }
}

/**
 * Square notifies webhooks with an HMAC-SHA256 signature of
 * `notificationUrl + rawBody`, base64 encoded, using the webhook signature key as secret.
 * See: https://developer.squareup.com/docs/webhooks/step3validate
 */
export function createSquareAdapter(notificationUrl: string): POSAdapter {
  return {
    provider: POSProvider.SQUARE,

    verifyWebhookSignature({ rawBody, signatureHeader, secret }) {
      if (!signatureHeader) return false;
      const hmac = crypto.createHmac("sha256", secret);
      hmac.update(notificationUrl + rawBody);
      const expected = hmac.digest("base64");
      const a = Buffer.from(expected);
      const b = Buffer.from(signatureHeader);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    },

    parseWebhookOrder(payload) {
      const body = payload as SquareOrderPayload;
      const order = body.data?.object?.order;
      if (!order) return null;

      const fulfillment = order.fulfillments?.[0];
      const normalized: NormalizedPOSOrder = {
        externalId: order.id,
        locationExternalId: order.location_id,
        channel: mapFulfillmentToChannel(fulfillment?.type),
        customerName: fulfillment?.pickup_details?.recipient?.display_name,
        items: (order.line_items ?? []).map((li) => ({
          posItemId: li.catalog_object_id,
          name: li.name,
          quantity: Number.parseInt(li.quantity, 10) || 1,
          modifiers: (li.modifiers ?? []).map((m) => m.name),
          notes: li.note,
        })),
        raw: payload,
      };
      return normalized;
    },

    async fetchOrder({ accessToken, externalId }) {
      const res = await fetch(`https://connect.squareup.com/v2/orders/${externalId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Square-Version": "2024-10-17",
        },
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { order: SquareOrderObject };
      return this.parseWebhookOrder({
        type: "order.fetched",
        data: { object: json },
      } satisfies SquareOrderPayload);
    },
  };
}
