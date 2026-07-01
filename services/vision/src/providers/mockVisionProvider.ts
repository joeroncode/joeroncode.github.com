import crypto from "node:crypto";
import type { VisionProvider, VisionVerificationRequest, VisionVerificationResponse } from "@ordercheck/shared";
import { deriveVerdict } from "../matching.js";

/**
 * Deterministic stand-in for local dev, CI, and demo tenants without an
 * Anthropic API key. Uses a hash of the image bytes to decide, per expected
 * item, whether it "appears" in the photo — deterministic per image so
 * repeated verification of the same photo is stable.
 */
export function createMockVisionProvider(): VisionProvider {
  return {
    name: "mock",

    async verifyOrder(request: VisionVerificationRequest): Promise<VisionVerificationResponse> {
      const imageHash = crypto.createHash("sha256").update(request.imageBase64).digest();

      const itemResults = request.expectedItems.map((item, index) => {
        const byte = imageHash[index % imageHash.length];
        const matched = byte % 10 !== 0;
        return {
          orderItemId: item.id,
          name: item.name,
          expectedQuantity: item.quantity,
          detectedQuantity: matched ? item.quantity : 0,
          matched,
          notes: matched ? null : "Not detected in photo (mock provider)",
        };
      });

      const { verdict, confidence } = deriveVerdict(itemResults);
      const missing = itemResults.filter((r) => !r.matched).map((r) => r.name);

      return {
        verdict,
        confidence,
        itemResults,
        summary:
          missing.length === 0
            ? "All expected items were detected in the photo."
            : `Missing or undetected items: ${missing.join(", ")}.`,
      };
    },
  };
}
