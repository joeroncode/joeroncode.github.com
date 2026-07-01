# POS Integrations

OrderCheck ingests orders from POS systems via provider-specific webhooks,
normalized to a common shape before anything else in the platform sees them.

## Adding a new provider

1. Implement the `POSAdapter` interface (`packages/shared/src/pos-adapter.ts`):
   - `verifyWebhookSignature` — validate the provider's webhook signature
     scheme using the per-integration `webhookSecret`.
   - `parseWebhookOrder` — convert the provider's webhook payload into a
     `NormalizedPOSOrder`.
   - `fetchOrder` — optional REST fallback for backfill/reconciliation.
2. Add the adapter under `services/api/src/pos/adapters/<provider>.ts`.
3. Register it in `services/api/src/pos/registry.ts`.
4. Add the provider to the `POSProvider` enum in `packages/shared/src/enums.ts`
   and the Prisma `POSProvider` enum in `services/api/prisma/schema.prisma`.

## Connecting an integration (per location)

`POST /pos-integrations` (requires `OWNER` or `ADMIN` role):

```json
{
  "provider": "SQUARE",
  "locationId": "loc_123",
  "accessToken": "<POS provider API token>"
}
```

The response includes a `webhookUrl` and a generated `webhookSecret` — enter
both into the POS provider's webhook configuration. The secret is only
returned once at creation time.

## Webhook flow

`POST /webhooks/pos/:provider/:locationId` is public (POS providers can't
authenticate with a bearer token), so requests are authenticated instead by
verifying the provider's HMAC signature against the stored `webhookSecret`
for that location + provider. The raw request body is required for signature
verification, so this route is mounted **before** the global JSON body
parser (`services/api/src/app.ts`) and parses its own body with
`express.raw()`.

On a valid signature, the payload is parsed into a `NormalizedPOSOrder` and
upserted as an `Order` (keyed by `locationId` + `posProvider` + `externalId`,
so repeated webhook deliveries for the same order are idempotent).

## Supported providers

| Provider | Status | Notes |
| --- | --- | --- |
| Square | Implemented | HMAC-SHA256 of `notificationUrl + rawBody`, base64-encoded, per [Square's webhook signature scheme](https://developer.squareup.com/docs/webhooks/step3validate). |
| Mock | Implemented | HMAC-SHA256 of the raw body only. Used for local dev, CI, and demo tenants without a real POS. |
| Toast | Interface defined, adapter not yet implemented | `getPOSAdapter` throws until an adapter is added. |
| Clover | Interface defined, adapter not yet implemented | `getPOSAdapter` throws until an adapter is added. |
