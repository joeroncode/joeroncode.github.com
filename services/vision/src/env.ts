import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4100),
  VISION_PROVIDER: z.enum(["claude", "mock"]).default("mock"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-opus-4-8"),
});

export const env = envSchema.parse(process.env);
