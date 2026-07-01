import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().default("postgresql://ordercheck:ordercheck@localhost:5432/ordercheck"),
  JWT_SECRET: z.string().min(16).default("dev-only-insecure-secret-change-me"),
  JWT_EXPIRES_IN_SECONDS: z.coerce.number().default(60 * 60 * 12),
  VISION_SERVICE_URL: z.string().default("http://localhost:4100"),
  CORS_ORIGIN: z.string().default("*"),
});

export const env = envSchema.parse(process.env);
