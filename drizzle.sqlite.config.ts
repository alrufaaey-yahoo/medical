import { defineConfig } from "drizzle-kit";

const configured = process.env.DATABASE_URL?.trim();
const url = configured?.startsWith("file:") ? configured : `file:${configured || process.env.SQLITE_DB_PATH || "./medical.db"}`;

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle/sqlite",
  dialect: "sqlite",
  dbCredentials: { url },
});
