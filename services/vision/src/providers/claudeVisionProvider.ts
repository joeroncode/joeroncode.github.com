import Anthropic from "@anthropic-ai/sdk";
import { VerificationVerdict, type VisionProvider, type VisionVerificationRequest, type VisionVerificationResponse } from "@ordercheck/shared";
import { env } from "../env.js";

const REPORT_TOOL_NAME = "report_verification";

const reportVerificationTool = {
  name: REPORT_TOOL_NAME,
  description:
    "Report the result of comparing a photo of a packed restaurant order against the list of expected order items.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      verdict: {
        type: "string",
        enum: [
          VerificationVerdict.MATCH,
          VerificationVerdict.MISMATCH,
          VerificationVerdict.PARTIAL_MATCH,
          VerificationVerdict.NEEDS_REVIEW,
        ],
        description: "Overall verdict for the order.",
      },
      confidence: {
        type: "number",
        description: "Confidence in the verdict, from 0 to 1.",
      },
      summary: {
        type: "string",
        description: "One or two sentence human-readable summary of the result.",
      },
      itemResults: {
        type: "array",
        description: "One entry per expected order item.",
        items: {
          type: "object",
          properties: {
            orderItemId: { type: "string" },
            name: { type: "string" },
            expectedQuantity: { type: "integer" },
            detectedQuantity: { type: "integer" },
            matched: { type: "boolean" },
            notes: { type: ["string", "null"] },
          },
          required: ["orderItemId", "name", "expectedQuantity", "detectedQuantity", "matched", "notes"],
          additionalProperties: false,
        },
      },
    },
    required: ["verdict", "confidence", "summary", "itemResults"],
    additionalProperties: false,
  },
} as const;

function buildPrompt(request: VisionVerificationRequest): string {
  const itemLines = request.expectedItems
    .map((item) => `- ${item.quantity}x ${item.name}${item.modifiers.length ? ` (${item.modifiers.join(", ")})` : ""}`)
    .join("\n");

  return [
    "You are verifying a restaurant order before it is handed to a customer.",
    "Compare the attached photo of the packed order against the expected items below.",
    "For each expected item, determine whether it is visibly present in the photo and in the correct quantity.",
    "Call the report_verification tool with your findings. Do not respond with plain text.",
    "",
    "Expected items:",
    itemLines,
  ].join("\n");
}

export function createClaudeVisionProvider(): VisionProvider {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  return {
    name: "claude-vision",

    async verifyOrder(request: VisionVerificationRequest): Promise<VisionVerificationResponse> {
      const response = await client.messages.create({
        model: env.ANTHROPIC_MODEL,
        max_tokens: 2048,
        tools: [reportVerificationTool],
        tool_choice: { type: "tool", name: REPORT_TOOL_NAME },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: request.mimeType,
                  data: request.imageBase64,
                },
              },
              { type: "text", text: buildPrompt(request) },
            ],
          },
        ],
      });

      const toolUse = response.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === REPORT_TOOL_NAME,
      );
      if (!toolUse) {
        throw new Error("Claude did not return a report_verification tool call");
      }

      return toolUse.input as VisionVerificationResponse;
    },
  };
}
