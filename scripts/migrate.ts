// Apply the schema to the configured Neon database.
// Run with:  npx tsx scripts/migrate.ts   (or ts-node)
// Uses DATABASE_URL_UNPOOLED if set (recommended for DDL), else DATABASE_URL.
import { SCHEMA_SQL } from "../src/lib/db/schema";
import { neon } from "@neondatabase/serverless";

async function main() {
  const conn =
    process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!conn) {
    console.error("DATABASE_URL (or _UNPOOLED) is not set.");
    process.exit(1);
  }
  const sql = neon(conn);
  // Execute each statement separately (neon's HTTP driver expects one at a time).
  // Strip SQL line comments before splitting so a leading comment doesn't
  // drop the whole statement.
  const stripped = SCHEMA_SQL.replace(/^\s*--.*$/gm, "");
  const statements = stripped
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    try {
      await sql.query(stmt + ";");
      console.log("ok:", stmt.split("\n")[0].slice(0, 70));
    } catch (err) {
      console.error("FAIL:", (err as Error).message);
      process.exit(1);
    }
  }
  console.log("Schema applied.");
}

main();
