import { neon } from "@neondatabase/serverless";

export interface QueryResult<T> {
  rows: T[];
}

export interface DbClient {
  query<T = unknown>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
}

let cachedClient: DbClient | null = null;

function wrapNeon(connectionString: string): DbClient {
  const sql = neon(connectionString, { fullResults: true });
  return {
    async query<T>(text: string, params: unknown[] = []) {
      const result = await sql.query(text, params);
      return { rows: result.rows as T[] };
    },
  };
}

// Schema is established once via a deliberate migration (see schema.ts). It is
// NOT re-verified on every cold start (that costs several round-trips). Run
// SCHEMA_SQL manually after creating the Neon project.
export async function getDb(): Promise<DbClient> {
  if (cachedClient) return cachedClient;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Provision Neon and set DATABASE_URL before using the database."
    );
  }

  cachedClient = wrapNeon(connectionString);
  return cachedClient;
}
