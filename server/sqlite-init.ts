import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { paymentBanks, labTests } from "../drizzle/schema";
import { DEFAULT_CATALOG } from "../client/src/lib/catalog";

function databaseUrl() {
  const configured = process.env.DATABASE_URL?.trim();
  if (configured?.startsWith("libsql://") || configured?.startsWith("https://") || configured?.startsWith("file:")) return configured;
  return `file:${configured || process.env.SQLITE_DB_PATH || "./medical.db"}`;
}

export async function initializeSqlite() {
  const url = databaseUrl();
  const client = createClient({ url, authToken: process.env.LIBSQL_AUTH_TOKEN });
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: `${process.cwd()}/drizzle/sqlite` });
  await db.insert(paymentBanks).values([{ name: "بنكك" }, { name: "أوكاش" }, { name: "فوري" }])
    .onConflictDoUpdate({ target: paymentBanks.name, set: { active: 1 } });
  for (const test of DEFAULT_CATALOG) {
    await db.insert(labTests).values({
      code: test.code,
      nameAr: test.name,
      nameEn: test.english,
      category: test.category,
      sample: test.sample,
      turnaround: test.turnaround,
      price: test.price,
      fieldsJson: JSON.stringify(test.fields),
      active: 1,
    }).onConflictDoUpdate({ target: labTests.code, set: {
      nameAr: test.name,
      nameEn: test.english,
      category: test.category,
      sample: test.sample,
      turnaround: test.turnaround,
      fieldsJson: JSON.stringify(test.fields),
      active: 1,
    } });
  }
  client.close();
}
