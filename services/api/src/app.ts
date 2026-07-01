import express, { type Express } from "express";
import cors from "cors";
import { pinoHttp } from "pino-http";
import { env } from "./env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { authRouter } from "./routes/auth.js";
import { locationsRouter } from "./routes/locations.js";
import { ordersRouter } from "./routes/orders.js";
import { posIntegrationsRouter } from "./routes/posIntegrations.js";
import { posWebhooksRouter } from "./routes/posWebhooks.js";

export function createApp(): Express {
  const app = express();

  app.use(pinoHttp({ autoLogging: env.NODE_ENV !== "test" }));
  app.use(cors({ origin: env.CORS_ORIGIN }));

  // Mounted before the JSON body parser: POS webhooks need the raw request
  // body to verify HMAC signatures.
  app.use("/webhooks/pos", posWebhooksRouter);

  app.use(express.json({ limit: "10mb" }));
  app.use("/uploads", express.static("uploads"));

  app.get("/health", (_req, res) => res.json({ status: "ok", service: "ordercheck-api" }));

  app.use("/auth", authRouter);
  app.use("/locations", locationsRouter);
  app.use("/orders", ordersRouter);
  app.use("/pos-integrations", posIntegrationsRouter);

  app.use(errorHandler);

  return app;
}
