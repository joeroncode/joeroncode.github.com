import type { VisionVerificationRequest, VisionVerificationResponse } from "@ordercheck/shared";
import { env } from "../env.js";
import { HttpError } from "../middleware/errorHandler.js";

export async function requestVisionVerification(
  request: VisionVerificationRequest,
): Promise<VisionVerificationResponse> {
  const res = await fetch(`${env.VISION_SERVICE_URL}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    throw new HttpError(502, `Vision service returned ${res.status}`);
  }

  return (await res.json()) as VisionVerificationResponse;
}
