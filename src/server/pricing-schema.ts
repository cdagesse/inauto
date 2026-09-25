import { z } from "zod";

export const guidanceInputSchema = z.object({
  make: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(80),
  year: z.number().int().min(1900).max(2100),
  miles: z.number().int().min(0).max(2_000_000),
  packages: z.array(z.string().max(30)).max(10).default([]),
  colorClass: z.enum(["std", "spec", "pts"]).default("std"),
  condition: z.enum(["ex", "good", "fair"]).default("ex"),
  history: z.enum(["clean", "acc"]).default("clean"),
  askingPrice: z.number().int().min(0).max(100_000_000),
});
export type GuidanceInput = z.infer<typeof guidanceInputSchema>;
