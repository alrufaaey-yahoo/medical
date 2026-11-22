import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { ENV } from "./env";

/**
 * Preview test accounts are only available when explicitly enabled in a
 * non-production environment. Unlike the old role switch, each role requires
 * its own high-entropy password stored as a scrypt hash.
 */
export function isPreviewLoginEnabled(): boolean {
  return process.env.ALLOW_PREVIEW_LOGIN === "1"
    && process.env.NODE_ENV !== "production"
    && Boolean(ENV.cookieSecret)
    && Boolean(ENV.appId);
}

export function hashPreviewPassword(password: string, salt = randomBytes(16)): string {
  const derived = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export function verifyPreviewPassword(password: string, encoded: string): boolean {
  const [algorithm, saltHex, hashHex] = encoded.split("$");
  if (algorithm !== "scrypt" || !/^[0-9a-f]{32}$/i.test(saltHex ?? "") || !/^[0-9a-f]{128}$/i.test(hashHex ?? "")) return false;
  try {
    const expected = Buffer.from(hashHex, "hex");
    const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export type PreviewRole = "admin" | "supervisor" | "cashier" | "lab";
