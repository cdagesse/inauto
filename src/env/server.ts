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
  VITU_SCOPE: z.string().default("oneapi:access"),
  /** NMVTIS vehicle history (brands, title history, junk/salvage). On by default once credentials exist; paid per inquiry. */
  VITU_NMVTIS_ENABLED: optionalString,
  VITU_NMVTIS_API_BASE: z.string().url().default("https://api-test.vitu.com/one/nmvtis/api/v1"),
  /** MVR (registration/owner/lien) verification. Base from the spec's servers block. */
  VITU_MVR_ENABLED: optionalString,
  VITU_MVR_API_BASE: z
    .string()
    .url()
    .default("https://api-test.vitu.com/lookup-national-vr-public-api/v1"),
  VITU_MVR_CREATE_PATH: z.string().default("/inquiry"),
  /** LoadUnifiedInquiryRecord path with "{id}" (spec: /inquiry/{inquiryId}/vitu-record). */
  VITU_MVR_UNIFIED_PATH: z.string().default("/inquiry/{id}/vitu-record"),
  /** LoadInquiryById path with "{id}", for processedDate/error. Optional; the record's content is the fallback signal. */
  VITU_MVR_INQUIRY_PATH: optionalString,
  VITU_MVR_LOAD_BY_REF_PATH: optionalString,
  VITU_MVR_LOCATION_ID: optionalString,
  /** JSON: per-state extra InquiryDTO fields, e.g. {"TX":{"dealerNumber":150786,"sellerUserName":"x"}} */
  VITU_MVR_STATE_EXTRAS: optionalString,
  /** Shared secret for Vitu callbacks: the HMAC key registered via SetCallbackSecurity (32–64 chars) and the ?key= fallback. */
  VITU_WEBHOOK_KEY: optionalString,
  /** "true" shows third-party listing photos. Off until platform terms are cleared. */
  EXTERNAL_PHOTOS: optionalString,
});

function parseJsonObject(v: string | undefined): Record<string, Record<string, unknown>> | null {
  if (!v) return null;
  try {
    const o = JSON.parse(v);
    return o && typeof o === "object" && !Array.isArray(o) ? o : null;
  } catch {
    return null;
  }
}

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
          scope: parsed.data.VITU_SCOPE,
          nmvtis:
            parsed.data.VITU_NMVTIS_ENABLED !== "false"
              ? {
                  apiBase: parsed.data.VITU_NMVTIS_API_BASE,
                  locationId: parsed.data.VITU_MVR_LOCATION_ID ?? null,
                }
              : null,
          mvr:
            parsed.data.VITU_MVR_ENABLED === "true"
              ? {
                  apiBase: parsed.data.VITU_MVR_API_BASE,
                  createPath: parsed.data.VITU_MVR_CREATE_PATH,
                  unifiedPath: parsed.data.VITU_MVR_UNIFIED_PATH,
                  inquiryPath: parsed.data.VITU_MVR_INQUIRY_PATH ?? null,
                  loadByRefPath: parsed.data.VITU_MVR_LOAD_BY_REF_PATH ?? null,
                  locationId: parsed.data.VITU_MVR_LOCATION_ID ?? null,
                  stateExtras: parseJsonObject(parsed.data.VITU_MVR_STATE_EXTRAS),
                }
              : null,
        }
      : null,
  vituWebhookKey: parsed.data.VITU_WEBHOOK_KEY ?? null,
};
