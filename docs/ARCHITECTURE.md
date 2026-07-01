# OrderCheck Architecture

OrderCheck is an enterprise SaaS platform that uses computer vision and AI to
verify restaurant orders against POS order data before they're handed to a
customer or a delivery driver.

## System overview

```
┌──────────────┐     ┌──────────────┐        ┌──────────────────┐
│   Web app    │     │  Mobile app  │        │  POS providers    │
│ (React/Vite) │     │ (Expo / RN)  │        │ (Square, Toast,…) │
└──────┬───────┘     └──────┬───────┘        └─────────┬─────────┘
       │ REST/JSON          │ REST/JSON                │ webhooks
       └──────────┬─────────┘                           │
                   ▼                                     ▼
            ┌─────────────────────────────────────────────────┐
            │                  API service                     │
            │  Express + TypeScript + Prisma + PostgreSQL       │
            │  - Auth (JWT), multi-tenant orgs/locations        │
            │  - Order + menu management                       │
            │  - POS adapter registry (webhook verify + parse)  │
            │  - Verification orchestration                    │
            └───────────────────────┬────────────────────────┘
                                     │ HTTP
                                     ▼
                        ┌─────────────────────────┐
                        │     Vision service        │
                        │  Pluggable VisionProvider  │
                        │  - Claude (multimodal LLM) │
                        │  - Mock (dev/test)          │
                        └─────────────────────────┘
```

## Monorepo layout

```
apps/
  web/      React + Vite + Tailwind staff dashboard
  mobile/   Expo/React Native app for camera-based verification at handoff
services/
  api/      Core REST API (Express, Prisma, PostgreSQL)
  vision/   CV/AI order-verification microservice
packages/
  shared/   Shared TypeScript types, zod schemas, POS + vision interfaces
```

## Data model (services/api/prisma/schema.prisma)

- **Organization** — a tenant (a restaurant brand or franchise group).
- **User** — staff member, scoped to an organization, with a `Role`
  (`OWNER` / `ADMIN` / `MANAGER` / `STAFF`).
- **Location** — a physical restaurant location within an organization.
- **POSIntegration** — a connected POS provider credential + webhook secret,
  scoped to one location.
- **MenuItem** — canonical menu items, optionally linked to a POS item ID.
- **Order** / **OrderItem** — an order pulled from a POS (or created
  manually) with its line items.
- **VerificationEvent** — the result of running AI verification against an
  order, including the photo URL, per-item results, and the verdict.

## Verification flow

1. An order arrives via a POS webhook (`POST /webhooks/pos/:provider/:locationId`)
   or is created directly through the API. The API upserts the `Order` and
   `OrderItem` rows.
2. Staff photograph the packed order (web upload or the mobile app's camera
   screen) once its status is `READY_FOR_VERIFICATION`.
3. The API stores the image and calls the vision service's `POST /verify`
   with the photo and the order's expected items.
4. The vision service's `VisionProvider` (Claude by default, in production)
   compares the photo against expected items and returns a structured
   verdict (`MATCH` / `PARTIAL_MATCH` / `MISMATCH` / `NEEDS_REVIEW`) with
   per-item detection results.
5. The API persists a `VerificationEvent` and updates the order's status
   (`VERIFIED` or `FLAGGED`), which both clients poll/display.

## POS integrations

See [POS_INTEGRATIONS.md](./POS_INTEGRATIONS.md) — integrations are
implemented behind a shared `POSAdapter` interface
(`packages/shared/src/pos-adapter.ts`) so adding a new provider means adding
one adapter, not touching webhook routing or order-sync logic.

## CV/AI verification

The vision service (`services/vision`) is provider-agnostic behind a
`VisionProvider` interface (`packages/shared/src/vision.ts`):

- `mock` — deterministic, no external dependency; used for local dev, CI,
  and demo tenants.
- `claude` — calls the Anthropic Messages API with the order photo as an
  image content block and a strict tool definition
  (`report_verification`), so the model returns a schema-validated verdict
  instead of freeform text. See `services/vision/src/providers/claudeVisionProvider.ts`.

## Local development

```bash
cp services/api/.env.example services/api/.env
cp services/vision/.env.example services/vision/.env
cp apps/web/.env.example apps/web/.env
docker compose up postgres -d
npm install
npm run build -w @ordercheck/shared
npm run prisma:migrate -w @ordercheck/api
npm run dev:api      # http://localhost:4000
npm run dev:vision   # http://localhost:4100
npm run dev:web      # http://localhost:5173
```

For the mobile app: `cd apps/mobile && npm run start` (Expo CLI).
