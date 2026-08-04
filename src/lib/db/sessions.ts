import { getDb } from "../db";
import { v4 as uuidv4 } from "uuid";
import type { User } from "./users";

export interface Session {
  id: number;
  user_id: number;
  token: string;
  created_at: string;
  expires_at: string;
}

export async function createSession(userId: number): Promise<Session> {
  const db = await getDb();
  const token = uuidv4();
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  const { rows } = await db.query<Session>(
    "INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3) RETURNING *",
    [userId, token, expiresAt]
  );
  return rows[0];
}

export async function validateSession(token: string): Promise<User | undefined> {
  const db = await getDb();
  const { rows } = await db.query<{ user_id: number; email: string; created_at: string }>(
    `SELECT s.user_id, u.email, u.created_at
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     WHERE s.token = $1 AND s.expires_at > now()`,
    [token]
  );

  const row = rows[0];
  if (!row) return undefined;

  return { id: row.user_id, email: row.email, created_at: row.created_at };
}

export async function deleteSession(token: string): Promise<void> {
  const db = await getDb();
  await db.query("DELETE FROM sessions WHERE token = $1", [token]);
}

export async function deleteAllUserSessions(userId: number): Promise<void> {
  const db = await getDb();
  await db.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
}
