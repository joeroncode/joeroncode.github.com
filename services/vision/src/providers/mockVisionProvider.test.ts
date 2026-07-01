import { describe, expect, it } from "vitest";
import { createMockVisionProvider } from "./mockVisionProvider.js";

describe("mock vision provider", () => {
  const provider = createMockVisionProvider();

  it("is deterministic for the same image and items", async () => {
    const request = {
      orderId: "order_1",
      imageBase64: "ZmFrZS1pbWFnZS1ieXRlcw==",
      mimeType: "image/jpeg" as const,
      expectedItems: [{ id: "i1", name: "Cheeseburger", quantity: 1, modifiers: [] }],
    };

    const first = await provider.verifyOrder(request);
    const second = await provider.verifyOrder(request);
    expect(first).toEqual(second);
  });

  it("produces one itemResult per expected item", async () => {
    const result = await provider.verifyOrder({
      orderId: "order_2",
      imageBase64: "YW5vdGhlci1pbWFnZQ==",
      mimeType: "image/png",
      expectedItems: [
        { id: "i1", name: "Fries", quantity: 1, modifiers: [] },
        { id: "i2", name: "Soda", quantity: 2, modifiers: ["No ice"] },
      ],
    });
    expect(result.itemResults).toHaveLength(2);
    expect(["MATCH", "MISMATCH", "PARTIAL_MATCH", "NEEDS_REVIEW"]).toContain(result.verdict);
  });
});
