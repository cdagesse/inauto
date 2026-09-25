import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let ok = false;
  try {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 1000)),
    ]);
    ok = true;
  } catch {
    ok = false;
  }
  return NextResponse.json(
    { ok, db: ok, time: new Date().toISOString() },
    { status: ok ? 200 : 503 },
  );
}
