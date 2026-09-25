import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/env/server";
import * as schema from "./schema";

/**
 * One postgres-js client per server instance, reused across requests.
 * On Vercel the pooled Neon URL fronts PgBouncer, so keep `max` small:
 * each serverless instance holds only a few sockets and the pooler
 * multiplexes thousands of instances onto the database.
 */
const globalForDb = globalThis as unknown as { __inautoSql?: ReturnType<typeof postgres> };

const sql =
  globalForDb.__inautoSql ??
  postgres(env.DATABASE_URL, {
    max: env.isProd ? 5 : 10,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false, // required behind PgBouncer transaction pooling
  });
if (!env.isProd) globalForDb.__inautoSql = sql;

export const db = drizzle(sql, { schema });
export type Db = typeof db;
