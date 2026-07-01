import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMockAdapter } from "./mock.js";

describe("mock POS adapter", () => {
  const adapter = createMockAdapter();
  const secret = "test-secret";

  it("verifies a correctly signed webhook", () => {
    const rawBody = JSON.stringify({ externalId: "o1", locationExternalId: "l1", items: [] });
    const signature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    expect(adapter.verifyWebhookSignature({ rawBody, signatureHeader: signature, secret })).toBe(true);
  });

  it("rejects a tampered payload", () => {
    const rawBody = JSON.stringify({ externalId: "o1", locationExternalId: "l1", items: [] });
    const signature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    const tampered = JSON.stringify({ externalId: "o2", locationExternalId: "l1", items: [] });
    expect(adapter.verifyWebhookSignature({ rawBody: tampered, signatureHeader: signature, secret })).toBe(false);
  });

  it("rejects a missing signature", () => {
    expect(adapter.verifyWebhookSignature({ rawBody: "{}", signatureHeader: undefined, secret })).toBe(false);
  });

  it("normalizes a mock order payload", () => {
    const normalized = adapter.parseWebhookOrder({
      externalId: "o1",
      locationExternalId: "l1",
      customerName: "Ada",
      items: [{ name: "Fries", quantity: 2, modifiers: ["No salt"] }],
    });
    expect(normalized).toMatchObject({
      externalId: "o1",
      locationExternalId: "l1",
      customerName: "Ada",
      items: [{ name: "Fries", quantity: 2, modifiers: ["No salt"] }],
    });
  });

  it("returns null for a malformed payload", () => {
    expect(adapter.parseWebhookOrder({ foo: "bar" })).toBeNull();
  });
});
