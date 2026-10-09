import "server-only";

import { getPerplDb } from "./perpl-db";
import { getPerplIndexerSnapshot } from "./perpl-indexer-snapshot";

export async function getSharedHistoricalSnapshot(
  accountId: string,
): Promise<string> {
  if (!/^\d+$/.test(accountId)) {
    throw new Error("Invalid Perpl account ID");
  }

  const sql = getPerplDb();

  // Reuse an existing account snapshot without querying Envio.
  const existing = await sql`
    SELECT target_block_number::text AS target
    FROM perpl_account_snapshots
    WHERE account_id = ${accountId}
    LIMIT 1
  `;

  if (existing[0]?.target) {
    return String(existing[0].target);
  }

  // Only propose a new block when no shared snapshot exists.
  const snapshot = await getPerplIndexerSnapshot();

  // PostgreSQL's unique account_id constraint makes creation
  // safe when multiple requests arrive concurrently.
  const result = await sql`
    SELECT perpl_get_or_create_account_snapshot(
      ${accountId},
      ${snapshot.targetBlockNumber}::numeric
    ) AS target
  `;

  const target = result[0]?.target;

  if (typeof target !== "string" || !/^\d+$/.test(target)) {
    throw new Error("Shared historical snapshot unavailable");
  }

  return target;
}
