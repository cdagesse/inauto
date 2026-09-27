/** Pure helpers for the listing description assistant: what we know about the car, as prompt text. */
import type { MarketSnapshot } from "@/lib/market/types";

export interface AssistantCar {
  year: number | null;
  make: string;
  model: string;
  trim: string | null;
  miles: number | null;
  color: string | null;
  vin: string | null;
}

export interface CarFacts {
  headline: string;
  lines: string[];
}

/** Facts from our market report for the car's generation, or just the basics when we have none. */
export function carFacts(car: AssistantCar, snapshot: MarketSnapshot | null): CarFacts {
  const headline = [car.year, car.make, car.model, car.trim].filter(Boolean).join(" ");
  const lines: string[] = [];
  if (car.miles != null) lines.push(`Mileage: ${car.miles.toLocaleString("en-US")} miles`);
  if (car.color) lines.push(`Exterior color: ${car.color}`);
  if (car.vin) lines.push(`VIN: ${car.vin}`);
  if (snapshot) {
    const code =
      car.year != null
        ? (snapshot.order.find((c) => (snapshot.years[c] ?? []).includes(car.year!)) ?? null)
        : null;
    const g = code ? snapshot.generations[code] : null;
    if (g) {
      lines.push(`Generation: ${g.name} (${g.years})`);
      if (g.engine) lines.push(`Engine: ${g.engine}`);
      if (g.hp) lines.push(`Power: ${g.hp}`);
      if (g.gearbox) lines.push(`Gearbox: ${g.gearbox}`);
      if (g.msrp) lines.push(`Original MSRP: $${Math.round(g.msrp).toLocaleString("en-US")}`);
      if (g.packages.length)
        lines.push(`Notable packages for this generation: ${g.packages.join(", ")}`);
      if (g.median)
        lines.push(
          `Recent dealer sales median: $${Math.round(g.median).toLocaleString("en-US")} (${g.sold} sales)`,
        );
      if (g.medianMiles)
        lines.push(
          `Typical mileage of cars sold: ${Math.round(g.medianMiles).toLocaleString("en-US")}`,
        );
      if (g.extra) lines.push(`Notes: ${g.extra}`);
    } else {
      lines.push(
        `Model report: ${snapshot.make.name} ${snapshot.model.name}, ${snapshot.totals.dealerSales} dealer sales on file`,
      );
    }
  }
  return { headline, lines };
}

export const ASSISTANT_SYSTEM = `You help a private seller write the description for a collector or enthusiast car they are listing on InAuto.

How you work:
- You already know the car from the facts provided. Do not ask for anything in the facts.
- Ask short, specific questions, at most three at a time, about what buyers of this kind of car care about: ownership history and how long they have had it, service and maintenance records, modifications or originality, condition details and known flaws, options and packages, why they are selling, and anything special (rare spec, provenance, awards).
- Keep replies brief and conversational. No praise of the car, no filler.
- After you have enough (usually two or three exchanges, or sooner if the seller gives a lot at once), write the description: 120 to 250 words, plain paragraphs, honest and specific, buyer-facing, first person is fine. Include known flaws plainly. Never invent facts or figures the seller did not give or that are not in the facts.
- Put the description only in the draft field. The seller decides whether to use it; never assume it is accepted. If they ask for changes, revise the draft.
- reply is what you say to the seller. questions are the questions you are asking now (empty if none). draft is the description when you have one, otherwise null. done is true when the draft is ready.`;
