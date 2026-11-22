import { afterEach, describe, expect, it, vi } from "vitest";
import { hashPreviewPassword, isPreviewLoginEnabled, verifyPreviewPassword } from "./preview-auth";

afterEach(() => vi.unstubAllEnvs());

describe("preview password accounts", () => {
  it("verifies the right password and rejects wrong or malformed hashes", () => {
    const encoded = hashPreviewPassword("strong-preview-password");
    expect(encoded).toMatch(/^scrypt\$/);
    expect(verifyPreviewPassword("strong-preview-password", encoded)).toBe(true);
    expect(verifyPreviewPassword("wrong-password", encoded)).toBe(false);
    expect(verifyPreviewPassword("strong-preview-password", "invalid")).toBe(false);
  });

  it("requires explicit non-production enablement and project signing configuration", () => {
    vi.stubEnv("ALLOW_PREVIEW_LOGIN", "1");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("MANUS_PROJECT_ID", "test-project");
    vi.stubEnv("MANUS_JWT_SECRET", "test-signing-key");
    expect(isPreviewLoginEnabled()).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(isPreviewLoginEnabled()).toBe(false);
  });
});
