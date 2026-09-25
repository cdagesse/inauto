import "@/env/load";

/**
 * CLI entry: `pnpm jobs:nightly` (dry run) or `pnpm jobs:nightly --live`.
 * Loads .env / .env.local via dotenv, then runs the same job the cron route runs.
 */
async function main() {
  const live = process.argv.includes("--live");
  if (live) process.env.JOBS_DRY_RUN = "false";
  const { runNightly } = await import("./nightly");
  const summary = await runNightly({ dryRun: !live });
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.errors.length ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
