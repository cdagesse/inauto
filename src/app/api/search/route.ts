import { NextResponse } from "next/server";
import { z } from "zod";
import { searchCatalog } from "@/server/queries/catalog";

export const runtime = "nodejs";

const schema = z.object({ q: z.string().trim().min(2).max(40) });

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = schema.safeParse({ q: url.searchParams.get("q") ?? "" });
  if (!parsed.success) {
    return NextResponse.json({ makes: [], models: [] }, { status: 400 });
  }
  const result = await searchCatalog(parsed.data.q, 8);
  return NextResponse.json(
    {
      makes: result.makes,
      models: result.models.map(({ make, makeSlug, model, modelSlug, ready }) => ({
        make,
        makeSlug,
        model,
        modelSlug,
        ready,
      })),
    },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } },
  );
}
