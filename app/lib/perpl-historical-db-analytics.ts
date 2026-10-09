import "server-only";

import { getPerplDb } from "./perpl-db";
import { readHistoricalLifecycleFromDb } from "./perpl-historical-db-reader";
import {
  buildHistoricalTraderAnalytics,
  type HistoricalRows,
} from "./perpl-historical-analytics";

export async function buildHistoricalAnalyticsFromDb(
  accountId: string,
) {
  if (!/^\d+$/.test(accountId)) {
    throw new Error("Invalid account ID");
  }

  const sql = getPerplDb();

  const status = await sql`
    SELECT
      (
        SELECT COUNT(*)::int
        FROM perpl_historical_sync s
        JOIN perpl_account_snapshots a
          ON a.account_id = s.account_id
        WHERE s.account_id = ${accountId}
          AND s.completed = true
          AND s.target_block_number = a.target_block_number
      ) AS completed_categories,
      (
        SELECT COUNT(DISTINCT transaction_hash)::int
        FROM perpl_historical_events
        WHERE account_id = ${accountId}
      ) AS total_hashes,
      (
        SELECT COUNT(*)::int
        FROM perpl_historical_fill_checked
        WHERE account_id = ${accountId}
      ) AS checked_hashes,
      (
        SELECT COUNT(DISTINCT target_block_number)::int
        FROM perpl_historical_sync
        WHERE account_id = ${accountId}
      ) AS snapshot_count
  `;

  const state = status[0];

  if (
    Number(state.completed_categories) !== 6 ||
    Number(state.total_hashes) !== Number(state.checked_hashes) ||
    Number(state.snapshot_count) !== 1
  ) {
    return {
      status: "syncing" as const,
      completedCategories: Number(state.completed_categories),
      totalHashes: Number(state.total_hashes),
      checkedHashes: Number(state.checked_hashes),
    };
  }

  const lifecycle = await readHistoricalLifecycleFromDb(accountId);

  const fillRows = await sql`
    SELECT payload
    FROM perpl_historical_taker_fills
    WHERE account_id = ${accountId}
    ORDER BY
      (payload->>'blockNumber')::numeric ASC,
      log_index ASC
  `;

  const rows: HistoricalRows = {
    ...lifecycle,
    takerOrderFills: fillRows.map(
      (row) =>
        row.payload as HistoricalRows["takerOrderFills"][number],
    ),
  };

  return {
    status: "complete" as const,
    indexedLifecycleEvents:
      rows.positionOpens.length +
      rows.positionIncreases.length +
      rows.positionDecreases.length +
      rows.positionCloses.length +
      rows.positionInverts.length +
      rows.positionLiquidations.length,
    analytics: buildHistoricalTraderAnalytics(rows),
  };
}
