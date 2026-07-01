import crypto from "node:crypto";
import { OrderChannel, POSProvider, type NormalizedPOSOrder, type POSAdapter } from "@ordercheck/shared";

interface MockOrderPayload {
  externalId: string;
  locationExternalId: string;
  channel?: OrderChannel;
  customerName?: string;
  items: Array<{ name: string; quantity?: number; modifiers?: string[]; notes?: string; posItemId?: string }>;
}

/**
 * Development/demo adapter used for local testing, CI, and sandbox tenants
 * that haven't connected a real POS yet. Signature verification uses a
 * simple HMAC, same shape as a real provider, so the webhook route logic is
 * exercised end-to-end without external dependencies.
 */
export function createMockAdapter(): POSAdapter {
  return {
    provider: POSProvider.MOCK,

    verifyWebhookSignature({ rawBody, signatureHeader, secret }) {
      if (!signatureHeader) return false;
      const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
      const a = Buffer.from(expected);
      const b = Buffer.from(signatureHeader);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    },

    parseWebhookOrder(payload) {
      const body = payload as MockOrderPayload;
      if (!body.externalId || !body.locationExternalId) return null;
      const normalized: NormalizedPOSOrder = {
        externalId: body.externalId,
        locationExternalId: body.locationExternalId,
        channel: body.channel ?? OrderChannel.TAKEOUT,
        customerName: body.customerName,
        items: (body.items ?? []).map((i) => ({
          posItemId: i.posItemId,
          name: i.name,
          quantity: i.quantity ?? 1,
          modifiers: i.modifiers ?? [],
          notes: i.notes,
        })),
        raw: payload,
      };
      return normalized;
    },

    async fetchOrder() {
      return null;
    },
  };
}
