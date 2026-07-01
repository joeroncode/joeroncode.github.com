import { z } from "zod";
import { OrderChannel, POSProvider } from "./enums.js";

export const registerSchema = z.object({
  organizationName: z.string().min(2).max(120),
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const orderItemInputSchema = z.object({
  menuItemId: z.string().optional(),
  name: z.string().min(1),
  quantity: z.number().int().positive().default(1),
  modifiers: z.array(z.string()).default([]),
  notes: z.string().optional(),
});

export const createOrderSchema = z.object({
  locationId: z.string(),
  externalId: z.string().optional(),
  posProvider: z.nativeEnum(POSProvider).default(POSProvider.MOCK),
  channel: z.nativeEnum(OrderChannel).default(OrderChannel.TAKEOUT),
  customerName: z.string().optional(),
  items: z.array(orderItemInputSchema).min(1),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const verifyOrderSchema = z.object({
  imageBase64: z.string().min(1),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]).default("image/jpeg"),
});
export type VerifyOrderInput = z.infer<typeof verifyOrderSchema>;

export const posConnectSchema = z.object({
  provider: z.nativeEnum(POSProvider),
  locationId: z.string(),
  accessToken: z.string().min(1),
  webhookSecret: z.string().optional(),
});
export type PosConnectInput = z.infer<typeof posConnectSchema>;
