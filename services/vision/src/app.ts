import express, { type Express } from "express";
import { pinoHttp } from "pino-http";
import { z } from "zod";
import { env } from "./env.js";
import { getVisionProvider } from "./providers/index.js";

const verifyRequestSchema = z.object({
  orderId: z.string(),
  imageBase64: z.string().min(1),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  expectedItems: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        quantity: z.number().int().positive(),
        modifiers: z.array(z.string()),
      }),
    )
    .min(1),
});

export function createApp(): Express {
  const app = express();
  const provider = getVisionProvider();

  app.use(pinoHttp({ autoLogging: env.NODE_ENV !== "test" }));
  app.use(express.json({ limit: "10mb" }));

  app.get("/health", (_req, res) => res.json({ status: "ok", service: "ordercheck-vision", provider: provider.name }));

  app.post("/verify", async (req, res, next) => {
    try {
      const input = verifyRequestSchema.parse(req.body);
      const result = await provider.verifyOrder(input);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: "Validation failed", details: err.flatten() });
      return;
    }
    // eslint-disable-next-line no-console
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
