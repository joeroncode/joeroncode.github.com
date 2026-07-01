import { describe, expect, it } from "vitest";
import { createOrderSchema, loginSchema, registerSchema } from "./schemas.js";

describe("registerSchema", () => {
  it("accepts a valid registration payload", () => {
    const result = registerSchema.safeParse({
      organizationName: "Joe's Diner",
      name: "Joe Ronoh",
      email: "jronoh5@gmail.com",
      password: "supersecret123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = registerSchema.safeParse({
      organizationName: "Joe's Diner",
      name: "Joe Ronoh",
      email: "not-an-email",
      password: "supersecret123",
    });
    expect(result.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("rejects an empty password", () => {
    const result = loginSchema.safeParse({ email: "a@b.com", password: "" });
    expect(result.success).toBe(false);
  });
});

describe("createOrderSchema", () => {
  it("defaults channel and posProvider, and requires at least one item", () => {
    const result = createOrderSchema.safeParse({
      locationId: "loc_1",
      items: [{ name: "Cheeseburger", quantity: 2 }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.channel).toBe("TAKEOUT");
      expect(result.data.posProvider).toBe("MOCK");
    }
  });

  it("rejects an order with zero items", () => {
    const result = createOrderSchema.safeParse({ locationId: "loc_1", items: [] });
    expect(result.success).toBe(false);
  });
});
