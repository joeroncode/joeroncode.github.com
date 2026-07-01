import type { VisionProvider } from "@ordercheck/shared";
import { env } from "../env.js";
import { createClaudeVisionProvider } from "./claudeVisionProvider.js";
import { createMockVisionProvider } from "./mockVisionProvider.js";

export function getVisionProvider(): VisionProvider {
  if (env.VISION_PROVIDER === "claude") {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is required when VISION_PROVIDER=claude");
    }
    return createClaudeVisionProvider();
  }
  return createMockVisionProvider();
}
