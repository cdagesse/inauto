import { z } from "zod";

export const PAGE_SIZE = 24;

export const createListingSchema = z.object({
  type: z.enum(["classified", "auction", "private"]),
  networkId: z.string().uuid().nullable().optional(),
  make: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(80),
  year: z.number().int().min(1900).max(2100),
  trim: z.string().trim().max(80).optional().nullable(),
  vin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-HJ-NPR-Z0-9]{11,17}$/, "Enter a valid VIN.")
    .optional()
    .nullable()
    .or(z.literal("")),
  miles: z.number().int().min(0).max(2_000_000),
  color: z.string().trim().max(60).optional().nullable(),
  colorClass: z.enum(["std", "spec", "pts"]).default("std"),
  condition: z.enum(["ex", "good", "fair"]).default("ex"),
  history: z.enum(["clean", "acc"]).default("clean"),
  packages: z.array(z.string().max(30)).max(10).default([]),
  title: z.string().trim().min(4, "Title needs at least 4 characters.").max(120),
  description: z.string().trim().max(8000).optional().nullable(),
  photos: z.array(z.string().url().max(500)).max(40).default([]),
  location: z.string().trim().max(100).optional().nullable(),
  askingPrice: z.number().int().min(0).max(100_000_000).nullable().optional(),
  reservePrice: z.number().int().min(0).max(100_000_000).nullable().optional(),
  auctionDays: z.union([z.literal(7), z.literal(14)]).optional(),
  priceGuidance: z.unknown().optional(),
  publish: z.boolean().default(false),
});
export type CreateListingInput = z.infer<typeof createListingSchema>;

export const listingFilterSchema = z.object({
  type: z.enum(["classified", "auction"]).optional(),
  make: z.string().trim().min(1).max(60).optional(),
  cursor: z.string().max(120).optional(),
});
export type ListingFilter = z.infer<typeof listingFilterSchema>;

/** Minimum bid increment: 1% of the current high bid rounded to $100, at least $100. */
export function minimumIncrement(current: number): number {
  return Math.max(100, Math.round((current * 0.01) / 100) * 100);
}
