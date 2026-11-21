import { createConnection, type RowDataPacket } from "mysql2/promise";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

type DuplicateShiftRow = RowDataPacket & {
  id: number;
  shiftDate: string;
  shiftType: string;
  duplicateCount: number | string;
  status: string;
  sequenceStart: number;
  sequenceCurrent: number;
  cashierUserId: number | null;
  labUserId: number | null;
  createdAt: Date | string;
};

const duplicateShiftsQuery = `
  SELECT
    shifts.id,
    shifts.shiftDate,
    shifts.shiftType,
    duplicate_groups.duplicateCount,
    shifts.status,
    shifts.sequenceStart,
    shifts.sequenceCurrent,
    shifts.cashierUserId,
    shifts.labUserId,
    shifts.createdAt
  FROM shifts
  INNER JOIN (
    SELECT shiftDate, shiftType, COUNT(*) AS duplicateCount
    FROM shifts
    GROUP BY shiftDate, shiftType
    HAVING COUNT(*) > 1
  ) AS duplicate_groups
    ON duplicate_groups.shiftDate = shifts.shiftDate
    AND duplicate_groups.shiftType = shifts.shiftType
  ORDER BY shifts.shiftDate, shifts.shiftType, shifts.id
`;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required. No connection was opened and no database changes were made.");
    process.exitCode = 1;
    return;
  }

  let connection;
  try {
    connection = await createConnection(databaseUrl);
    const [rows] = await connection.query<DuplicateShiftRow[]>(duplicateShiftsQuery);

    if (rows.length === 0) {
      console.log("No duplicate shifts found for (shiftDate, shiftType). This audit is read-only; no migration was run.");
      return;
    }

    console.error(`Found ${rows.length} shift rows in duplicate date/type groups. Review and reconcile them before applying the unique constraint.`);
    console.log(JSON.stringify(rows, null, 2));
    process.exitCode = 2;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Shift audit failed; no migration was run. ${message}`);
    process.exitCode = 1;
  } finally {
    await connection?.end();
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  void main();
}
