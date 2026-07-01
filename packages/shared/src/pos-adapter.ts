import type { OrderChannel, POSProvider } from "./enums.js";

/**
 * A POS order normalized into OrderCheck's internal shape, regardless of
 * which upstream provider (Square, Toast, Clover, ...) produced it.
 */
export interface NormalizedPOSOrder {
  externalId: string;
  locationExternalId: string;
  channel: OrderChannel;
  customerName?: string;
  items: Array<{
    posItemId?: string;
    name: string;
    quantity: number;
    modifiers: string[];
    notes?: string;
  }>;
  raw: unknown;
}

/**
 * Every POS integration implements this interface so the rest of the
 * platform (webhook routing, order sync, verification) never needs to know
 * about provider-specific payload shapes.
 */
export interface POSAdapter {
  readonly provider: POSProvider;

  /** Verifies an inbound webhook's signature using the integration's shared secret. */
  verifyWebhookSignature(input: {
    rawBody: string;
    signatureHeader: string | undefined;
    secret: string;
  }): boolean;

  /** Converts a provider-specific webhook payload into a NormalizedPOSOrder. */
  parseWebhookOrder(payload: unknown): NormalizedPOSOrder | null;

  /** Fetches an order directly from the provider's API (used for backfill/reconciliation). */
  fetchOrder(input: { accessToken: string; externalId: string }): Promise<NormalizedPOSOrder | null>;
}
