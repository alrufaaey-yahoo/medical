import { and, eq } from "drizzle-orm";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { InsertUser, localLoginAccounts, staffMembers, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _client: Client | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

function databaseUrl() {
  const configured = process.env.DATABASE_URL?.trim();
  if (configured?.startsWith("libsql://") || configured?.startsWith("https://")) return configured;
  if (configured?.startsWith("file:")) return configured;
  return `file:${configured || process.env.SQLITE_DB_PATH || "./medical.db"}`;
}

/** SQLite is the default runtime store; a libSQL URL remains supported for hosted SQLite. */
export async function getDb() {
  if (!_db) {
    try {
      const url = databaseUrl();
      _client = createClient({ url, authToken: process.env.LIBSQL_AUTH_TOKEN });
      _db = drizzle(_client);
    } catch (error) {
      console.warn("[Database] Failed to initialize SQLite/libSQL:", error);
      _client = null;
      _db = null;
    }
  }
  return _db;
}

export async function closeDb() {
  _client?.close();
  _client = null;
  _db = null;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onConflictDoUpdate({ target: users.openId, set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function isLocalLoginEnabled(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const [account] = await db.select({ active: localLoginAccounts.active })
    .from(localLoginAccounts).where(eq(localLoginAccounts.userId, userId)).limit(1);
  return account?.active === 1;
}

export async function applyStaffRole(userId: number, email: string | null | undefined): Promise<boolean> {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return false;
  const db = await getDb();
  if (!db) return false;
  const [member] = await db.select({ id: staffMembers.id, role: staffMembers.role, active: staffMembers.active })
    .from(staffMembers)
    .where(and(eq(staffMembers.email, normalized), eq(staffMembers.active, 1)))
    .limit(1);
  if (!member) return false;
  const [account] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (!account || account.role !== "user") return false;
  await db.update(users).set({ role: member.role }).where(eq(users.id, userId));
  await db.update(staffMembers).set({ userId }).where(eq(staffMembers.id, member.id));
  return true;
}
