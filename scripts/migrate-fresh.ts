// Destructive migration: drops ALL existing tables (Libra's + any partial
// Pocket tables) and recreates Pocket's clean schema from scratch.
//
// ⚠️  DATA LOSS: run only on a database you intend to wipe.
//
// Run with:  npx tsx --env-file=.env scripts/migrate-fresh.ts
import { SCHEMA_SQL } from "../src/lib/db/schema";
import { neon } from "@neondatabase/serverless";

const DROP_SQL = `
DROP TABLE IF EXISTS user_preferences CASCADE;
DROP TABLE IF EXISTS bookmarks CASCADE;
DROP TABLE IF EXISTS reading_progress CASCADE;
DROP TABLE IF EXISTS books CASCADE;
DROP TABLE IF EXISTS otp_codes CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS users CASCADE;
`;

async function main() {
  const conn =
    process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!conn) {
    console.error("DATABASE_URL (or _UNPOOLED) is not set.");
    process.exit(1);
  }
  const sql = neon(conn);

  console.log("Dropping existing tables...");
  const drops = DROP_SQL.split(/;\s*\n/)
    .map((s) => s.replace(/--.*$/gm, "").trim())
    .filter((s) => s.length > 0);
  for (const stmt of drops) {
    try {
      await sql.query(stmt + ";");
      console.log("  dropped:", stmt.match(/DROP TABLE IF EXISTS (\w+)/)?.[1]);
    } catch (err) {
      console.error("  drop FAIL:", (err as Error).message);
    }
  }

  console.log("\nCreating Pocket schema...");
  const stripped = SCHEMA_SQL.replace(/^\s*--.*$/gm, "");
  const creates = stripped
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const stmt of creates) {
    try {
      await sql.query(stmt + ";");
      console.log("  ok:", stmt.split("\n")[0].slice(0, 70));
    } catch (err) {
      console.error("  FAIL:", (err as Error).message);
      process.exit(1);
    }
  }
  console.log("\nFresh Pocket schema applied.");
}

main();
