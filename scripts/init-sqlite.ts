import "dotenv/config";
import { initializeSqlite } from "../server/sqlite-init";

await initializeSqlite();
console.log(`SQLite ready at ${process.env.DATABASE_URL || process.env.SQLITE_DB_PATH || "./medical.db"}`);
