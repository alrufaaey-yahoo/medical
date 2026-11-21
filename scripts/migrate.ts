/**
 * Applies every SQL file in drizzle/ in filename order and records each file in
 * __app_migrations. This keeps deployments reproducible even though the older
 * migrations were written by hand and are not all present in drizzle's journal.
 */
import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run migrations");
}

const connection = await mysql.createConnection({ uri: databaseUrl, multipleStatements: true });
await connection.query(`
  CREATE TABLE IF NOT EXISTS __app_migrations (
    name varchar(255) NOT NULL PRIMARY KEY,
    appliedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

const files = (await readdir("drizzle")).filter(file => file.endsWith(".sql")).sort();
for (const file of files) {
  const [applied] = await connection.query("SELECT name FROM __app_migrations WHERE name = ?", [file]);
  if ((applied as unknown[]).length > 0) {
    console.log(`skip    ${file}`);
    continue;
  }
  const sql = await readFile(path.join("drizzle", file), "utf8");
  const statements = sql
    .split(/--> statement-breakpoint|\*\*\*/g)
    .map(statement => statement.trim())
    .filter(Boolean);
  for (const statement of statements) {
    await connection.query(statement);
  }
  await connection.query("INSERT INTO __app_migrations (name) VALUES (?)", [file]);
  console.log(`applied ${file} (${statements.length} statements)`);
}

await connection.end();
console.log("Migrations complete.");
