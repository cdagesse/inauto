import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { valuationRequests } from "@/db/schema";
import { env } from "@/env/server";
import { getMarketSnapshot } from "@/lib/market/source";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { valuate } from "@/lib/valuation/engine";

export const runtime = "nodejs";

const slug = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]+$/);

const bodySchema = z.object({
  make: slug,
  model: slug,
  inputs: z.object({
    generation: z.string().min(1).max(16),
    year: z.number().int().min(1900).max(2100),
    miles: z.number().min(0).max(2_000_000),
    packages: z.array(z.string().max(32)).max(8).default([]),
    colorClass: z.enum(["std", "spec", "pts"]),
    condition: z.enum(["ex", "good", "fair"]),
    history: z.enum(["clean", "acc"]),
  }),
  contactEmail: z.string().email().max(254).optional(),
});

const LIMIT = 60; // requests per window per IP
const WINDOW_MS = 60_000;

export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  const rl = rateLimit(`valuation:${ip}`, LIMIT, WINDOW_MS);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { make, model, inputs, contactEmail } = parsed.data;

  const snapshot = await getMarketSnapshot(make, model);
  if (!snapshot) return NextResponse.json({ error: "Unknown model" }, { status: 404 });
  if (!snapshot.generations[inputs.generation]) {
    return NextResponse.json({ error: "Unknown generation" }, { status: 400 });
  }

  const result = valuate(snapshot, inputs);

  // Log the request for tuning (and, optionally, leads). Never let logging fail the response.
  try {
    const session = await auth();
    const ipHash = createHash("sha256")
      .update(`${ip}|${env.AUTH_SECRET}`)
      .digest("hex")
      .slice(0, 32);
    await db.insert(valuationRequests).values({
      userId: session?.user?.id ?? null,
      modelSlug: `${make}/${model}`,
      generationCode: inputs.generation,
      inputs,
      outputs: result,
      contactEmail: contactEmail ?? null,
      ipHash,
    });
  } catch (e) {
    console.error("valuation_request insert failed", e instanceof Error ? e.message : e);
  }

  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store", "X-RateLimit-Remaining": String(rl.remaining) },
  });
}
