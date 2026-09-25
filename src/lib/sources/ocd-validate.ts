/**
 * Checks catalog Old Cars Data aliases against OCD's public make and model lists.
 * No key needed. Run: `pnpm exec tsx src/lib/sources/ocd-validate.ts`
 */
import { CATALOG } from "@/data/catalog";
import { fetchJson } from "./http";
import { OCD_BASE } from "./ocd";

export interface OcdValidationReport {
  makesChecked: number;
  unknownMakes: string[];
  unknownLines: { make: string; model: string; line: string }[];
  unverified: { make: string; model: string; keyword: string | null }[];
  ok: number;
}

async function list(path: string, params: Record<string, string> = {}): Promise<string[]> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetchJson<{ data?: unknown }>(`${OCD_BASE}${path}${qs ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error(`OCD ${path} returned ${res.status}`);
  return Array.isArray(res.body?.data) ? res.body!.data.map(String) : [];
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]/g, "");

export async function validateOcdAliases(): Promise<OcdValidationReport> {
  const makes = new Map((await list("/makes")).map((m) => [norm(m), m]));
  const report: OcdValidationReport = {
    makesChecked: 0,
    unknownMakes: [],
    unknownLines: [],
    unverified: [],
    ok: 0,
  };
  const linesByMake = new Map<string, Set<string>>();
  for (const e of CATALOG) {
    const a = e.aliases.ocd;
    const make = makes.get(norm(a.make));
    if (!make) {
      if (!report.unknownMakes.includes(a.make)) report.unknownMakes.push(a.make);
      continue;
    }
    if (!linesByMake.has(make)) {
      linesByMake.set(make, new Set((await list("/models", { make })).map(norm)));
      report.makesChecked++;
    }
    if (a.lineUnverified) {
      report.unverified.push({ make: a.make, model: e.model, keyword: a.keyword ?? null });
      continue;
    }
    if (!linesByMake.get(make)!.has(norm(a.model))) {
      report.unknownLines.push({ make: a.make, model: e.model, line: a.model });
    } else report.ok++;
  }
  return report;
}

if (process.argv[1]?.endsWith("ocd-validate.ts")) {
  validateOcdAliases()
    .then((r) => {
      console.log(`makes checked: ${r.makesChecked}, aliases with a verified line: ${r.ok}`);
      if (r.unknownMakes.length) console.log(`unknown makes: ${r.unknownMakes.join(", ")}`);
      if (r.unknownLines.length) {
        console.log(`unknown lines (${r.unknownLines.length}):`);
        for (const u of r.unknownLines) console.log(`  ${u.make} | ${u.model} -> "${u.line}"`);
      }
      console.log(`keyword-only (no OCD line): ${r.unverified.length}`);
      for (const u of r.unverified)
        console.log(`  ${u.make} | ${u.model} (keyword "${u.keyword}")`);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
