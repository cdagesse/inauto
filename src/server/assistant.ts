"use server";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { requireUser } from "@/auth";
import { env } from "@/env/server";
import { ASSISTANT_SYSTEM, type AssistantCar, carFacts } from "@/lib/assistant/context";
import { rateLimit } from "@/lib/rate-limit";
import { matchMarketModel } from "./market-match";
import { type ActionResult, fail, toError } from "./result";

const carSchema = z.object({
  year: z.number().int().min(1900).max(2100).nullable(),
  make: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(80),
  trim: z.string().trim().max(80).nullable(),
  miles: z.number().int().min(0).max(2_000_000).nullable(),
  color: z.string().trim().max(60).nullable(),
  vin: z.string().trim().max(17).nullable(),
});
const turnSchema = z.object({
  car: carSchema,
  transcript: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(6000) }))
    .max(40),
  /** The seller's current draft, if any, so revisions start from it. */
  current: z.string().max(8000).nullable().optional(),
});

const Reply = z.object({
  reply: z.string(),
  questions: z.array(z.string()),
  draft: z.string().nullable(),
  done: z.boolean(),
});
export type AssistantReply = z.infer<typeof Reply>;

/**
 * One turn of the description assistant. The client keeps the transcript; we
 * add what we know about the car from the market report and ask Claude for a
 * structured reply. The draft is only ever a suggestion the seller accepts.
 */
export async function describeCarTurn(raw: unknown): Promise<ActionResult<AssistantReply>> {
  try {
    const user = await requireUser();
    if (!env.ANTHROPIC_API_KEY) return fail("The writing assistant is not configured.");
    const parsed = turnSchema.safeParse(raw);
    if (!parsed.success) return fail("Check the car details.");
    const { car, transcript, current } = parsed.data;
    const rl = rateLimit(`assistant:${user.id}`, 60, 60 * 60 * 1000);
    if (!rl.ok) return fail("Too many messages. Try again in a little while.");

    const match = await matchMarketModel(car.make, car.model, car.year).catch(() => null);
    const facts = carFacts(car as AssistantCar, match?.snapshot ?? null);
    const factsText = [
      `Car: ${facts.headline}`,
      ...facts.lines,
      current ? `Seller's current draft (revise it if they ask):\n${current}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const messages: Anthropic.MessageParam[] = transcript.length
      ? transcript.map((t) => ({ role: t.role, content: t.content }))
      : [
          {
            role: "user",
            content: "I'd like help writing the description. Where should we start?",
          },
        ];
    if (messages[0]!.role !== "user") messages.unshift({ role: "user", content: "Let's start." });

    const response = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 4000,
      output_config: { effort: "medium", format: zodOutputFormat(Reply) },
      system: [
        { type: "text", text: ASSISTANT_SYSTEM, cache_control: { type: "ephemeral" } },
        { type: "text", text: `Facts about this car:\n${factsText}` },
      ],
      messages,
    });
    if (response.stop_reason === "refusal") return fail("The assistant could not help with that.");
    const out = response.parsed_output;
    if (!out) return fail("The assistant gave an unexpected answer. Try again.");
    return { ok: true, data: out };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError)
      return fail("The assistant is busy. Try again in a moment.");
    if (e instanceof Anthropic.APIError) {
      console.error("[assistant]", e.status, e.message);
      return fail("The assistant is unavailable right now.");
    }
    return toError(e);
  }
}
