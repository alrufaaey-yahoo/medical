import "dotenv/config";
import { randomBytes } from "node:crypto";
import { chmod, writeFile } from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";
import { hashPreviewPassword } from "../server/_core/preview-auth";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required to seed preview accounts");
if (process.env.ALLOW_PREVIEW_LOGIN !== "1" || process.env.NODE_ENV === "production") {
  console.log("Preview accounts are disabled; no account was created.");
  process.exit(0);
}

const roles = [
  ["admin", "مدير النظام"],
  ["supervisor", "مشرف التشغيل"],
  ["cashier", "الكاشير"],
  ["lab", "فني المختبر"],
] as const;
const connection = await mysql.createConnection({ uri: databaseUrl });
const [existing] = await connection.query("SELECT role FROM preview_login_accounts");
const existingRoles = new Set((existing as Array<{ role: string }>).map(row => row.role));
const credentials: Array<{ role: string; label: string; password: string }> = [];

for (const [role, label] of roles) {
  if (existingRoles.has(role)) continue;
  const password = randomBytes(24).toString("base64url");
  await connection.execute(
    "INSERT INTO preview_login_accounts (role, passwordHash) VALUES (?, ?)",
    [role, hashPreviewPassword(password)],
  );
  credentials.push({ role, label, password });
}
await connection.end();

if (credentials.length) {
  const projectId = process.env.MANUS_PROJECT_ID || "clinic-preview";
  const outputPath = path.join("/home/ubuntu", `.clinic-preview-credentials-${projectId}`);
  await writeFile(outputPath, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  await chmod(outputPath, 0o600);
  console.log(`Created ${credentials.length} preview accounts; credentials saved to a private one-time file.`);
} else {
  console.log("All preview accounts already exist; passwords were not changed.");
}
