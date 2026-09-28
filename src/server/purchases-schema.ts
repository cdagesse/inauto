import { z } from "zod";

const httpsUrl = z
  .string()
  .trim()
  .url()
  .refine((u) => u.startsWith("https://"), "Links must be https.");

export const inquirySchema = z.object({
  listingId: z.string().uuid(),
  message: z.string().trim().min(10, "Say a little more (at least 10 characters).").max(4000),
  contact: z.string().trim().max(200).optional().nullable(),
});

export const purchaseSchema = z.object({
  listingId: z.string().uuid(),
  mode: z.enum(["in_person", "online"]),
  buyer: z.object({
    legalName: z.string().trim().min(2, "Enter your legal name.").max(120),
    email: z.string().trim().email("Enter a valid email."),
    phone: z.string().trim().min(7, "Enter a phone number.").max(40),
    address: z.string().trim().min(6, "Enter your address.").max(300),
  }),
  options: z.object({
    inspection: z.boolean().default(false),
    titleVetting: z.boolean().default(false),
    escrow: z.boolean().default(false),
    shipping: z.boolean().default(false),
    shippingTo: z.string().trim().max(300).optional(),
  }),
  uploads: z.object({
    titleFront: httpsUrl.optional(),
    titleBack: httpsUrl.optional(),
    ownershipVideo: httpsUrl.optional(),
  }),
  note: z.string().trim().max(2000).optional().nullable(),
  /** The buyer confirms they read the online safeguards. */
  acknowledged: z.boolean(),
});
