import "@/env/load";
import postgres from "postgres";

/**
 * Removes the demo GT3 RS market rows (sourceListingId / sourceId prefixed "fx-")
 * once real Visor and Old Cars Data rows are flowing, so demo and live data never mix.
 * Usage: pnpm demo:purge
 */
async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = postgres(url, { max: 1 });
  try {
    const [a] =
      await sql`delete from dealer_sale where source_listing_id like 'fx-%' returning 1`.then(
        (r) => [r.length],
      );
    const [b] =
      await sql`delete from dealer_active where source_listing_id like 'fx-%' returning 1`.then(
        (r) => [r.length],
      );
    const [c] = await sql`delete from auction_result where source_id like 'fx-%' returning 1`.then(
      (r) => [r.length],
    );
    const [d] =
      await sql`delete from external_listing where source_id like 'fixture:%' returning 1`.then(
        (r) => [r.length],
      );
    console.log(
      `purged demo rows: ${a} dealer sales, ${b} active, ${c} auction results, ${d} external listings`,
    );
  } finally {
    await sql.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
