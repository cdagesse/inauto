import "@/env/load";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Applies ./drizzle migrations over a direct (unpooled) connection. Run in CI/deploy, never at request time. */
async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = postgres(url, { max: 1 });
  try {
    await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
    console.log("migrations applied");
  } finally {
    await sql.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
