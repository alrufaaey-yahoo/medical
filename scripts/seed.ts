/** Seeds the SQLite clinic catalog without overwriting operator-managed setup data. */
import "dotenv/config";
import { initializeSqlite } from "../server/sqlite-init";

await initializeSqlite();
console.log("SQLite catalog and payment banks are ready; setup data was preserved.");
