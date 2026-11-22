import { describe, expect, it } from "vitest";
import { hashLocalPassword, verifyLocalPassword } from "./local-auth";

describe("local named-account passwords", () => {
  it("stores a non-reversible scrypt hash and verifies the correct password", async () => {
    const encoded = await hashLocalPassword("clinic-test-password-42");
    expect(encoded).toMatch(/^scrypt\$/);
    expect(encoded).not.toContain("clinic-test-password-42");
    expect(await verifyLocalPassword("clinic-test-password-42", encoded)).toBe(true);
    expect(await verifyLocalPassword("incorrect-password", encoded)).toBe(false);
  });

  it("rejects malformed or unknown hash formats", async () => {
    await expect(verifyLocalPassword("pw", "plaintext")).resolves.toBe(false);
    await expect(verifyLocalPassword("pw", "scrypt$00$00")).resolves.toBe(false);
  });
});
