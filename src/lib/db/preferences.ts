import { getDb } from "../db";

export interface UserPreferences {
  id: number;
  user_id: number;
  font_size: number;
  line_height: number;
  updated_at: string;
}

export const DEFAULT_FONT_SIZE = 18;
export const DEFAULT_LINE_HEIGHT = 8;
export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 32;
export const MIN_LINE_HEIGHT = 4;
export const MAX_LINE_HEIGHT = 24;
export const STEP = 2;

export async function getPreferences(userId: number): Promise<UserPreferences> {
  const db = await getDb();
  const { rows } = await db.query<UserPreferences>(
    "SELECT * FROM user_preferences WHERE user_id = $1",
    [userId]
  );
  let prefs = rows[0];
  if (!prefs) {
    const inserted = await db.query<UserPreferences>(
      "INSERT INTO user_preferences (user_id) VALUES ($1) RETURNING *",
      [userId]
    );
    prefs = inserted.rows[0];
  }
  return prefs;
}

export async function updateFontSize(
  userId: number,
  size: number
): Promise<UserPreferences> {
  const clamped = clampToStep(size, MIN_FONT_SIZE, MAX_FONT_SIZE, DEFAULT_FONT_SIZE);
  const db = await getDb();
  await db.query(
    "INSERT INTO user_preferences (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
    [userId]
  );
  await db.query(
    "UPDATE user_preferences SET font_size = $1, updated_at = now() WHERE user_id = $2",
    [clamped, userId]
  );
  return getPreferences(userId);
}

export async function updateLineHeight(
  userId: number,
  height: number
): Promise<UserPreferences> {
  const clamped = clampToStep(height, MIN_LINE_HEIGHT, MAX_LINE_HEIGHT, DEFAULT_LINE_HEIGHT);
  const db = await getDb();
  await db.query(
    "INSERT INTO user_preferences (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
    [userId]
  );
  await db.query(
    "UPDATE user_preferences SET line_height = $1, updated_at = now() WHERE user_id = $2",
    [clamped, userId]
  );
  return getPreferences(userId);
}

function clampToStep(value: number, min: number, max: number, def: number): number {
  const clamped = Math.min(max, Math.max(min, value));
  const stepped = Math.round((clamped - def) / STEP) * STEP + def;
  return Math.min(max, Math.max(min, stepped));
}
