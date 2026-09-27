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
  /** Claude API key for the listing description assistant; the feature hides without it. */
  ANTHROPIC_API_KEY: optionalString,
  /** Vitu title checks (client credentials). Sandbox defaults; override for stage/production. */
  VITU_CLIENT_ID: optionalString,
  VITU_CLIENT_SECRET: optionalString,
  VITU_AUTH_URL: z
    .string()
    .url()
    .default("https://auth.test.vitu.com/realms/api/protocol/openid-connect/token"),
  VITU_API_BASE: z.string().url().default("https://api-test.vitu.com"),
  VITU_SCOPE: z.string().default("oneapi:access"),
  /** Title/NMVTIS report endpoint path from Vitu's API spec; "{vin}" is substituted. Unset = job idles. */
  VITU_TITLE_PATH: optionalString,
  VITU_TITLE_METHOD: z.enum(["GET", "POST"]).default("POST"),
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
  vitu:
    parsed.data.VITU_CLIENT_ID && parsed.data.VITU_CLIENT_SECRET
      ? {
          clientId: parsed.data.VITU_CLIENT_ID,
          clientSecret: parsed.data.VITU_CLIENT_SECRET,
          authUrl: parsed.data.VITU_AUTH_URL,
          apiBase: parsed.data.VITU_API_BASE,
          scope: parsed.data.VITU_SCOPE,
          titlePath: parsed.data.VITU_TITLE_PATH ?? null,
          titleMethod: parsed.data.VITU_TITLE_METHOD,
        }
      : null,
};
