import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { env } from "@/env/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DB_TIMEOUT_MS = 1000;

class HealthTimeout extends Error {
  constructor() {
    super(`no reply within ${DB_TIMEOUT_MS} ms`);
    this.name = "HealthTimeout";
  }
}

/**
 * Uptime probe. Public (see proxy.ts), so the body carries only a coarse failure class;
 * the driver's message, which can name the host, database or role, goes to the server
 * log. The config flags make a deploy with a missing secret visible in one GET.
 */
export async function GET() {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let reason: "timeout" | "error" | null = null;
  try {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new HealthTimeout()), DB_TIMEOUT_MS);
      }),
    ]);
  } catch (e) {
    reason = e instanceof HealthTimeout ? "timeout" : "error";
    const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.error(`[health] db ${reason}: ${detail}`);
  } finally {
    clearTimeout(timer);
  }
  const ok = reason === null;
  return NextResponse.json(
    {
      ok,
      db: { ok, ms: Date.now() - started, ...(reason ? { reason } : {}) },
      config: {
        cron: !!env.CRON_SECRET,
        blob: !!env.BLOB_READ_WRITE_TOKEN,
        vitu: !!env.vitu,
      },
      time: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 },
  );
}
