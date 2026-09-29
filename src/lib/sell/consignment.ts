import { z } from "zod";

/** What UrCar does on a virtual consignment; the seller ticks what they want. */
export const CONSIGNMENT_SERVICES = [
  {
    key: "condition_report",
    label: "Condition report",
    blurb: "Our inspection, with photos of every flaw.",
  },
  {
    key: "photos",
    label: "Professional photos",
    blurb: "Studio-quality set, plus a walkaround video.",
  },
  {
    key: "logistics",
    label: "Pickup and transport",
    blurb: "We collect the car and handle delivery to the buyer.",
  },
  {
    key: "facility",
    label: "Keep it at our facility",
    blurb: "Stored, shown and sold from UrCar; no strangers at your house.",
  },
] as const;

export type ConsignmentService = (typeof CONSIGNMENT_SERVICES)[number]["key"];

const serviceKeys = CONSIGNMENT_SERVICES.map((s) => s.key) as [
  ConsignmentService,
  ...ConsignmentService[],
];

/** One consignment request as the form posts it. Stored in service_order.details. */
export const consignmentSchema = z.object({
  year: z.coerce.number().int().min(1900).max(2100),
  make: z.string().trim().min(1, "Enter the make.").max(60),
  model: z.string().trim().min(1, "Enter the model.").max(80),
  trim: z.string().trim().max(80).optional().or(z.literal("")),
  miles: z.coerce.number().int().min(0).max(2_000_000),
  vin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-HJ-NPR-Z0-9]{11,17}$/, "Enter a valid VIN (11 to 17 characters, no I, O or Q).")
    .optional()
    .or(z.literal("")),
  location: z.string().trim().min(2, "Where is the car?").max(120),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  services: z.array(z.enum(serviceKeys)).min(1, "Pick at least one service."),
  estimate: z.coerce.number().int().min(0).optional(),
  notes: z.string().trim().max(1500).optional().or(z.literal("")),
});

export type ConsignmentRequest = z.infer<typeof consignmentSchema>;

/** "2004 Ferrari 360 Challenge Stradale" for the queue and the confirmation. */
export function consignmentCar(
  r: Pick<ConsignmentRequest, "year" | "make" | "model" | "trim">,
): string {
  return [r.year, r.make, r.model, r.trim].filter(Boolean).join(" ");
}
