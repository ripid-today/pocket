import { getDb } from "../db";

export interface User {
  id: number;
  email: string;
  created_at: string;
}

export async function createUser(email: string): Promise<User> {
  const db = await getDb();
  const { rows } = await db.query<User>(
    "INSERT INTO users (email) VALUES ($1) RETURNING *",
    [email.toLowerCase().trim()]
  );
  return rows[0];
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const db = await getDb();
  const { rows } = await db.query<User>("SELECT * FROM users WHERE email = $1", [
    email.toLowerCase().trim(),
  ]);
  return rows[0];
}

export async function getUserById(id: number): Promise<User | undefined> {
  const db = await getDb();
  const { rows } = await db.query<User>("SELECT * FROM users WHERE id = $1", [id]);
  return rows[0];
}
