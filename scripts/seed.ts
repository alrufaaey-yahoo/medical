/**
 * Seeds the clinic identity and the built-in lab catalog without overwriting
 * prices an operator has already changed.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { chmod, writeFile } from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";
import { DEFAULT_CATALOG } from "../client/src/lib/catalog";
import { hashLocalPassword } from "../server/local-auth";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run the seed");
}

const connection = await mysql.createConnection({ uri: databaseUrl });

const [defaultAccounts] = await connection.execute("SELECT id FROM users WHERE username = ? LIMIT 1", ["alrufaaey"]);
const [existingAdmins] = await connection.execute("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
if ((defaultAccounts as unknown[]).length === 0 && (existingAdmins as unknown[]).length === 0) {
  await connection.beginTransaction();
  try {
    const openId = "local_default_admin";
    await connection.execute(
      "INSERT INTO users (openId, name, username, loginMethod, role) VALUES (?, ?, ?, ?, ?)",
      [openId, "مدير النظام", "alrufaaey", "local-password", "admin"],
    );
    const [createdUsers] = await connection.execute("SELECT id FROM users WHERE openId = ? LIMIT 1", [openId]);
    const userId = (createdUsers as Array<{ id: number }>)[0]?.id;
    if (!userId) throw new Error("تعذر إنشاء حساب المدير الافتراضي");
    const bootstrapPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD || randomBytes(24).toString("base64url");
    if (bootstrapPassword.length < 12) throw new Error("BOOTSTRAP_ADMIN_PASSWORD يجب أن تكون 12 محرفًا على الأقل");
    await connection.execute(
      "INSERT INTO local_login_accounts (userId, passwordHash, active, createdBy) VALUES (?, ?, 1, ?)",
      [userId, await hashLocalPassword(bootstrapPassword), userId],
    );
    await connection.execute("UPDATE local_login_accounts SET mustChangePassword = 1 WHERE userId = ?", [userId]);
    await connection.commit();
    if (!process.env.BOOTSTRAP_ADMIN_PASSWORD) {
      const outputPath = path.join("/home/ubuntu", `.medical-bootstrap-${process.env.MANUS_PROJECT_ID || "local"}`);
      await writeFile(outputPath, `${bootstrapPassword}\n`, { mode: 0o600, flag: "wx" });
      await chmod(outputPath, 0o600);
      console.log(`تم إنشاء حساب bootstrap وحفظ كلمة المرور مرة واحدة في ${outputPath}`);
    } else {
      console.log("تم إنشاء حساب bootstrap من secret محمي");
    }
  } catch (error) {
    await connection.rollback();
    throw error;
  }
} else {
  console.log("an administrator or the default username already exists; no default credentials were changed");
}

const [settings] = await connection.query("SELECT id FROM clinic_settings LIMIT 1");
if ((settings as unknown[]).length === 0) {
  await connection.query(
    `INSERT INTO clinic_settings
      (name, address, phone, email, website, footerText, consultationGeneralPrice, consultationSpecialistPrice)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "مستوصف بكّا الطبي الحديث",
      "الخرطوم بحري · الحلفايا · السودان",
      "011 234 5678 · 0912 440 218",
      "info@bakka-clinic.sd",
      "https://www.bakka-clinic.sd",
      "نتمنى لكم دوام الصحة والعافية. هذه النتيجة تعتمد على العينة والطريقة المعتمدة بالمختبر.",
      35000,
      50000,
    ],
  );
  console.log("created clinic settings");
} else {
  console.log("clinic settings already exist");
}

for (const test of DEFAULT_CATALOG) {
  await connection.query(
    `INSERT INTO lab_tests (code, nameAr, nameEn, category, sample, turnaround, price, fieldsJson, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE
       nameAr = VALUES(nameAr),
       nameEn = VALUES(nameEn),
       category = VALUES(category),
       sample = VALUES(sample),
       turnaround = VALUES(turnaround),
       fieldsJson = VALUES(fieldsJson),
       active = 1`,
    [test.code, test.name, test.english, test.category, test.sample, test.turnaround, test.price, JSON.stringify(test.fields)],
  );
}
console.log(`seeded ${DEFAULT_CATALOG.length} lab tests`);

await connection.end();
console.log("Seed complete.");
