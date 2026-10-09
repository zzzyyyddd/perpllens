import "server-only";
import { neon } from "@neondatabase/serverless";

export function getPerplDb() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl || databaseUrl === "[SENSITIVE]") {
    throw new Error("Neon database connection unavailable");
  }

  return neon(databaseUrl);
}
