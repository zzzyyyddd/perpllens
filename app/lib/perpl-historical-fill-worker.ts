import "server-only";

import { getPerplDb } from "./perpl-db";
import { fetchHistoricalTakerFills } from "./perpl-historical-fills";

const BATCH_SIZE = 25;

export async function syncHistoricalFillBatch(accountId: string) {
  if (!/^\d+$/.test(accountId)) {
    throw new Error("Invalid account ID");
  }

  const sql = getPerplDb();

  const rows = await sql`
    SELECT DISTINCT e.transaction_hash
    FROM perpl_historical_events e
    WHERE e.account_id = ${accountId}
      AND NOT EXISTS (
        SELECT 1
        FROM perpl_historical_fill_checked c
        WHERE c.account_id = e.account_id
          AND c.transaction_hash = e.transaction_hash
      )
    ORDER BY e.transaction_hash
    LIMIT ${BATCH_SIZE}
  `;

  const hashes = rows.map((row) => String(row.transaction_hash));

  if (hashes.length === 0) {
    return { status: "complete" as const, checked: 0, fills: 0 };
  }

  const fills = await fetchHistoricalTakerFills(hashes);

  const requested = new Set(hashes.map((hash) => hash.toLowerCase()));

  for (const fill of fills) {
    if (
      !requested.has(fill.transactionHash.toLowerCase()) ||
      !Number.isSafeInteger(fill.logIndex) ||
      fill.logIndex < 0
    ) {
      throw new Error("Invalid taker fill response");
    }
  }

  // Satu statement SQL memastikan penyimpanan fills dan
  // checkpoint transaksi berhasil atau gagal bersama.
  const result = await sql`
    WITH input_fills AS (
      SELECT value AS payload
      FROM jsonb_array_elements(${JSON.stringify(fills)}::jsonb)
    ),
    saved_fills AS (
      INSERT INTO perpl_historical_taker_fills (
        account_id,
        transaction_hash,
        log_index,
        payload
      )
      SELECT
        ${accountId},
        payload->>'transactionHash',
        (payload->>'logIndex')::integer,
        payload
      FROM input_fills
      ON CONFLICT (account_id, transaction_hash, log_index)
      DO UPDATE SET payload = EXCLUDED.payload
      RETURNING 1
    ),
    saved_checks AS (
      INSERT INTO perpl_historical_fill_checked (
        account_id,
        transaction_hash
      )
      SELECT ${accountId}, value
      FROM jsonb_array_elements_text(
        ${JSON.stringify(hashes)}::jsonb
      )
      WHERE (SELECT COUNT(*) FROM saved_fills) >= 0
      ON CONFLICT (account_id, transaction_hash)
      DO NOTHING
      RETURNING 1
    )
    SELECT
      (SELECT COUNT(*)::int FROM saved_fills) AS fills,
      (SELECT COUNT(*)::int FROM saved_checks) AS checked
  `;

  return {
    status: hashes.length < BATCH_SIZE
      ? ("complete" as const)
      : ("syncing" as const),
    checked: Number(result[0]?.checked ?? 0),
    fills: Number(result[0]?.fills ?? 0),
  };
}
