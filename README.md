# OrderCheck

OrderCheck is an enterprise SaaS platform that uses computer vision, AI, and
POS integrations to verify restaurant orders are complete and correct before
they're shipped or handed to a customer.

- **Web dashboard** (`apps/web`) — staff-facing order queue, photo-based
  verification, POS integration management.
- **Mobile app** (`apps/mobile`) — Expo/React Native app for camera-based
  verification at the counter, drive-thru, or delivery handoff.
- **API service** (`services/api`) — multi-tenant REST API: auth, orders,
  POS webhook ingestion, verification orchestration (Express + Prisma +
  PostgreSQL).
- **Vision service** (`services/vision`) — CV/AI order-verification
  microservice with a pluggable provider (Claude multimodal LLM in
  production, a deterministic mock for local dev/CI).
- **Shared package** (`packages/shared`) — TypeScript types, zod schemas,
  and the `POSAdapter` / `VisionProvider` interfaces shared across services.

See [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for the full system
design and [docs/POS_INTEGRATIONS.md](./docs/POS_INTEGRATIONS.md) for how
POS providers are integrated.

## Quick start

```bash
npm install
cp services/api/.env.example services/api/.env
cp services/vision/.env.example services/vision/.env
cp apps/web/.env.example apps/web/.env

docker compose up postgres -d
npm run build -w @ordercheck/shared
npm run prisma:migrate -w @ordercheck/api

npm run dev:api      # http://localhost:4000
npm run dev:vision   # http://localhost:4100
npm run dev:web      # http://localhost:5173
```

Or run everything (API, vision service, web) in Docker:

```bash
docker compose up --build
```

Mobile app:

```bash
cd apps/mobile
cp .env.example .env
npm run start
```

## Scripts

- `npm run build` — build all workspaces
- `npm run typecheck` — typecheck all workspaces
- `npm run test` — run unit tests
- `npm run lint` — lint all workspaces
