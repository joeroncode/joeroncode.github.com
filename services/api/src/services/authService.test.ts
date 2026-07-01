import { describe, expect, it } from "vitest";
import { hashPassword, signAccessToken, verifyAccessToken, verifyPassword } from "./authService.js";

describe("authService", () => {
  it("hashes a password and verifies it round-trips", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(hash).not.toBe("correct-horse-battery-staple");
    expect(await verifyPassword("correct-horse-battery-staple", hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("signs and verifies an access token", () => {
    const { token, expiresIn } = signAccessToken({ sub: "user_1", organizationId: "org_1", role: "OWNER" });
    expect(expiresIn).toBeGreaterThan(0);

    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe("user_1");
    expect(payload.organizationId).toBe("org_1");
    expect(payload.role).toBe("OWNER");
  });

  it("rejects a tampered token", () => {
    const { token } = signAccessToken({ sub: "user_1", organizationId: "org_1", role: "OWNER" });
    expect(() => verifyAccessToken(`${token}tampered`)).toThrow();
  });
});
