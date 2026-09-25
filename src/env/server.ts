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
  AUTH_SECRET: z.string().min(16),
  AUTH_URL: optionalString,
  AUTH_GOOGLE_ID: optionalString,
  AUTH_GOOGLE_SECRET: optionalString,
  AUTH_GITHUB_ID: optionalString,
  AUTH_GITHUB_SECRET: optionalString,
  AUTH_DEV_LOGIN: optionalString,
  CRON_SECRET: optionalString,
  JOBS_DRY_RUN: optionalString,
  VISOR_API_KEY: optionalString,
  VISOR_MONTHLY_BUDGET: z.coerce.number().int().positive().default(2000),
  OCD_API_KEY: optionalString,
  OCD_MONTHLY_BUDGET: z.coerce.number().int().positive().default(10),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  throw new Error(`Invalid server environment: ${issues}`);
}

export const env = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === "production",
  devLoginEnabled: parsed.data.NODE_ENV !== "production" && parsed.data.AUTH_DEV_LOGIN === "true",
  jobsDryRun: parsed.data.JOBS_DRY_RUN !== "false",
};
