import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { createSquareAdapter } from "./square.js";

describe("square POS adapter", () => {
  const notificationUrl = "https://api.ordercheck.dev/webhooks/pos/square/loc_1";
  const adapter = createSquareAdapter(notificationUrl);
  const secret = "square-webhook-secret";

  function sign(rawBody: string): string {
    return crypto.createHmac("sha256", secret).update(notificationUrl + rawBody).digest("base64");
  }

  it("verifies a valid Square HMAC signature", () => {
    const rawBody = JSON.stringify({ type: "order.updated" });
    expect(
      adapter.verifyWebhookSignature({ rawBody, signatureHeader: sign(rawBody), secret }),
    ).toBe(true);
  });

  it("rejects an invalid signature", () => {
    const rawBody = JSON.stringify({ type: "order.updated" });
    expect(
      adapter.verifyWebhookSignature({ rawBody, signatureHeader: "not-a-real-signature", secret }),
    ).toBe(false);
  });

  it("parses a Square order webhook into a normalized order", () => {
    const payload = {
      type: "order.updated",
      data: {
        object: {
          order: {
            id: "sq_order_1",
            location_id: "loc_1",
            fulfillments: [{ type: "PICKUP", pickup_details: { recipient: { display_name: "Grace Hopper" } } }],
            line_items: [
              { catalog_object_id: "item_1", name: "Double Cheeseburger", quantity: "2", modifiers: [{ name: "Extra pickles" }] },
            ],
          },
        },
      },
    };

    const normalized = adapter.parseWebhookOrder(payload);
    expect(normalized).toMatchObject({
      externalId: "sq_order_1",
      locationExternalId: "loc_1",
      channel: "TAKEOUT",
      customerName: "Grace Hopper",
      items: [{ posItemId: "item_1", name: "Double Cheeseburger", quantity: 2, modifiers: ["Extra pickles"] }],
    });
  });

  it("returns null when there is no order in the payload", () => {
    expect(adapter.parseWebhookOrder({ type: "ping" })).toBeNull();
  });
});
