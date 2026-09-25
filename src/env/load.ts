import { config } from "dotenv";

/** For CLI scripts only (migrate, seed, jobs). Loads .env.local first, then .env; existing process env always wins. */
config({ path: ".env.local" });
config();
