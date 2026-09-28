import { z } from "zod";
import { ownsEvidencePathname } from "@/lib/purchase/evidence";

export const inquirySchema = z.object({
  listingId: z.string().uuid(),
  message: z.string().trim().min(10, "Say a little more (at least 10 characters).").max(4000),
  contact: z.string().trim().max(200).optional().nullable(),
});

/**
 * Evidence uploads are stored as private Blob pathnames under the buyer's own
 * purchases/{clerkId}/ prefix, so the schema is built per user: a pathname
 * belonging to anyone else, or any URL, is rejected.
 */
export function purchaseSchemaFor(clerkId: string) {
  const evidence = z
    .string()
    .trim()
    .max(300)
    .refine((p) => ownsEvidencePathname(p, clerkId), "Upload the file again.");
  return z.object({
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
      titleFront: evidence.optional(),
      titleBack: evidence.optional(),
      ownershipVideo: evidence.optional(),
    }),
    note: z.string().trim().max(2000).optional().nullable(),
    /** The buyer confirms they read the online safeguards. */
    acknowledged: z.boolean(),
  });
}
export type PurchaseInput = z.infer<ReturnType<typeof purchaseSchemaFor>>;

export const sellerDetailsSchema = z.object({
  legalName: z.string().trim().max(120).optional(),
  address: z.string().trim().max(300).optional(),
  phone: z.string().trim().max(40).optional(),
});
