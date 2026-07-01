import type { VerificationVerdict } from "./enums.js";
import type { OrderItemDTO, VerificationItemResult } from "./types.js";

export interface VisionVerificationRequest {
  orderId: string;
  imageBase64: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  expectedItems: Pick<OrderItemDTO, "id" | "name" | "quantity" | "modifiers">[];
}

export interface VisionVerificationResponse {
  verdict: VerificationVerdict;
  confidence: number;
  itemResults: VerificationItemResult[];
  summary: string;
}

/**
 * Pluggable CV/AI backend. The default implementation calls a multimodal
 * LLM; a mock implementation is used for local dev/tests without API keys.
 */
export interface VisionProvider {
  readonly name: string;
  verifyOrder(request: VisionVerificationRequest): Promise<VisionVerificationResponse>;
}
