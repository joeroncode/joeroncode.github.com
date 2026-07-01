import { describe, expect, it } from "vitest";
import { deriveVerdict } from "./matching.js";

function item(matched: boolean) {
  return {
    orderItemId: "i1",
    name: "Fries",
    expectedQuantity: 1,
    detectedQuantity: matched ? 1 : 0,
    matched,
    notes: null,
  };
}

describe("deriveVerdict", () => {
  it("returns MATCH when every item matched", () => {
    const { verdict } = deriveVerdict([item(true), item(true)]);
    expect(verdict).toBe("MATCH");
  });

  it("returns MISMATCH when no items matched", () => {
    const { verdict } = deriveVerdict([item(false), item(false)]);
    expect(verdict).toBe("MISMATCH");
  });

  it("returns PARTIAL_MATCH when some items matched", () => {
    const { verdict } = deriveVerdict([item(true), item(false)]);
    expect(verdict).toBe("PARTIAL_MATCH");
  });

  it("returns NEEDS_REVIEW for an empty item list", () => {
    const { verdict, confidence } = deriveVerdict([]);
    expect(verdict).toBe("NEEDS_REVIEW");
    expect(confidence).toBe(0);
  });
});
