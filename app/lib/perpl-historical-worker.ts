import "server-only";

import { getPerplDb } from "./perpl-db";
import { fetchHistoricalBatch, HISTORICAL_BATCH_SIZE } from "./perpl-historical-batch";
import { storeHistoricalBatch } from "./perpl-historical-store";
import { getSharedHistoricalSnapshot } from "./perpl-shared-snapshot";
import type {
  HistoricalCursor,
  HistoricalEventType,
} from "./perpl-historical-sync-types";

export async function syncHistoricalEventBatch(
  accountId: string,
  eventType: HistoricalEventType,
) {
  if (!/^\d+$/.test(accountId)) {
    throw new Error("Invalid account ID");
  }

  const sql = getPerplDb();

  const rows = await sql`
    SELECT
      last_block_number::text AS block_number,
      last_log_index AS log_index,
      last_event_id AS event_id,
      target_block_number::text AS target_block_number,
      completed
    FROM perpl_historical_sync
    WHERE account_id = ${accountId}
      AND event_type = ${eventType}
    LIMIT 1
  `;

  const checkpoint = rows[0];

  const sharedTarget = await getSharedHistoricalSnapshot(accountId);

  if (
    checkpoint?.target_block_number &&
    BigInt(String(checkpoint.target_block_number)) > BigInt(sharedTarget)
  ) {
    throw new Error("Checkpoint exceeds shared snapshot");
  }

  if (checkpoint?.completed) {
    if (
      BigInt(String(checkpoint.target_block_number)) === BigInt(sharedTarget)
    ) {
      return { status: "complete" as const, processed: 0 };
    }

    const extended = await sql`
      SELECT perpl_extend_historical_snapshot(
        ${accountId},
        ${eventType},
        ${String(checkpoint.target_block_number)}::numeric,
        ${sharedTarget}::numeric
      ) AS extended
    `;

    if (extended[0]?.extended !== true) {
      throw new Error("Historical snapshot reconciliation failed");
    }
  }

  const snapshot = {
    targetBlockNumber:
      checkpoint?.completed || !checkpoint?.target_block_number
        ? sharedTarget
        : String(checkpoint.target_block_number),
  };

  const cursor: HistoricalCursor | null =
    checkpoint?.block_number != null &&
    checkpoint?.log_index != null &&
    checkpoint?.event_id != null
      ? {
          blockNumber: String(checkpoint.block_number),
          logIndex: Number(checkpoint.log_index),
          id: String(checkpoint.event_id),
        }
      : null;

  const events = await fetchHistoricalBatch(
    accountId,
    eventType,
    snapshot.targetBlockNumber,
    cursor,
  );

  await storeHistoricalBatch(
    accountId,
    eventType,
    cursor,
    snapshot.targetBlockNumber,
    events,
  );

  if (events.length < HISTORICAL_BATCH_SIZE) {
    const last = events.at(-1);

    const finalCursor = last
      ? {
          blockNumber: last.blockNumber,
          logIndex: last.logIndex,
          id: last.id,
        }
      : cursor;

    const completed = await sql`
      SELECT perpl_complete_historical_sync(
        ${accountId},
        ${eventType},
        ${finalCursor?.blockNumber ?? null}::numeric,
        ${finalCursor?.logIndex ?? null},
        ${finalCursor?.id ?? null},
        ${snapshot.targetBlockNumber}::numeric
      ) AS completed
    `;

    if (completed[0]?.completed !== true) {
      throw new Error("Historical completion failed");
    }

    return { status: "complete" as const, processed: events.length };
  }

  return { status: "syncing" as const, processed: events.length };
}
