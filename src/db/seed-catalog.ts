import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "./schema";

/** Seeds the searchable make/model catalog. Filled in by the search slice. */
export async function seedCatalog(_db: PostgresJsDatabase<typeof schema>): Promise<void> {}
