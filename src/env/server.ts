import "server-only";
import { z } from "zod";

/**
 * Server-side environment. Validated once at boot so a misconfigured deploy
 * fails loudly instead of at the first request. Nothing in here may be
 * imported from a client component; `server-only` enforces that at build time.
 */
const optionalString = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  DATABASE_URL_UNPOOLED: optionalString,
  // Clerk (Vercel Marketplace) owns identity and sessions.
  CLERK_SECRET_KEY: z.string().min(10),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(10),
  CLERK_WEBHOOK_SIGNING_SECRET: optionalString,
  /** Salt for truncated IP hashes in valuation_request and outbound_click. */
  IP_HASH_SALT: optionalString,
  /** Legacy name for IP_HASH_SALT; still honoured so existing deployments keep working. */
  AUTH_SECRET: optionalString,
  CRON_SECRET: optionalString,
  JOBS_DRY_RUN: optionalString,
  VISOR_API_KEY: optionalString,
  VISOR_MONTHLY_BUDGET: z.coerce.number().int().positive().default(2000),
  OCD_API_KEY: optionalString,
  OCD_MONTHLY_BUDGET: z.coerce.number().int().positive().default(10),
  BLOB_READ_WRITE_TOKEN: optionalString,
  /** "true" shows third-party listing photos. Off until platform terms are cleared. */
  EXTERNAL_PHOTOS: optionalString,
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  throw new Error(`Invalid server environment: ${issues}`);
}
const ipHashSalt = parsed.data.IP_HASH_SALT ?? parsed.data.AUTH_SECRET;
if (!ipHashSalt || ipHashSalt.length < 16) {
  throw new Error(
    "Invalid server environment: IP_HASH_SALT (or AUTH_SECRET) must be at least 16 characters",
  );
}

export const env = {
  ...parsed.data,
  ipHashSalt,
  isProd: parsed.data.NODE_ENV === "production",
  jobsDryRun: parsed.data.JOBS_DRY_RUN !== "false",
  externalPhotos: parsed.data.EXTERNAL_PHOTOS === "true",
};
