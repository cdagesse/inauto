import "server-only";
import { z } from "zod";
import { isBlobUrl } from "@/lib/listings/blob-url";

export const PAGE_SIZE = 24;
export const MAX_PHOTOS = 24;

/** Photos are UrCar Blob uploads only, so a seller cannot point a listing at a host they control. */
export const photoUrl = z
  .string()
  .trim()
  .max(500)
  .url()
  .refine((u) => {
    try {
      return new URL(u).protocol === "https:";
    } catch {
      return false;
    }
  }, "Photo links must be https.")
  .refine(isBlobUrl, "Upload photos through UrCar.");

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
  photos: z.array(photoUrl).max(MAX_PHOTOS).default([]),
  location: z.string().trim().max(100).optional().nullable(),
  askingPrice: z.number().int().min(0).max(100_000_000).nullable().optional(),
  reservePrice: z.number().int().min(0).max(100_000_000).nullable().optional(),
  auctionDays: z.union([z.literal(7), z.literal(14)]).optional(),
  publish: z.boolean().default(false),
});

const money = z.coerce.number().int().min(0).max(100_000_000).optional();
const year = z.coerce.number().int().min(1900).max(2100).optional();
const miles = z.coerce.number().int().min(0).max(2_000_000).optional();
/** Fields an owner may change after creation. Type, network and auction length are fixed. */
export const updateListingSchema = createListingSchema
  .pick({
    make: true,
    model: true,
    year: true,
    trim: true,
    vin: true,
    miles: true,
    color: true,
    colorClass: true,
    condition: true,
    history: true,
    packages: true,
    title: true,
    description: true,
    photos: true,
    location: true,
    askingPrice: true,
    reservePrice: true,
  })
  .extend({
    id: z.string().uuid(),
    sellerDetails: z
      .object({
        legalName: z.string().trim().max(120).optional(),
        address: z.string().trim().max(300).optional(),
        phone: z.string().trim().max(40).optional(),
      })
      .optional(),
  });

export const listingFilterSchema = z.object({
  type: z.enum(["classified", "auction"]).optional(),
  make: z.string().trim().min(1).max(60).optional(),
  model: z.string().trim().min(1).max(80).optional(),
  trim: z.string().trim().min(1).max(80).optional(),
  yearMin: year,
  yearMax: year,
  priceMin: money,
  priceMax: money,
  milesMin: miles,
  milesMax: miles,
  cursor: z.string().max(120).optional(),
  /** live (default): cars for sale now. past: sold, ended or withdrawn listings. */
  when: z.enum(["live", "past"]).optional(),
  /** Past listings only: sold, or unsold (ended without a sale, withdrawn). */
  result: z.enum(["sold", "unsold"]).optional(),
});
export type ListingFilter = z.infer<typeof listingFilterSchema>;

/** Minimum bid increment: 1% of the current high bid rounded to $100, at least $100. */
export function minimumIncrement(current: number): number {
  return Math.max(100, Math.round((current * 0.01) / 100) * 100);
}
