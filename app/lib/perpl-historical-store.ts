import "server-only";

import { getPerplDb } from "./perpl-db";
import type {
  HistoricalCursor,
  HistoricalEventType,
  HistoricalIndexedEvent,
} from "./perpl-historical-sync-types";

type StoredEvent = HistoricalIndexedEvent & Record<string, unknown>;

export async function storeHistoricalBatch(
  accountId: string,
  eventType: HistoricalEventType,
  expectedCursor: HistoricalCursor | null,
  targetBlockNumber: string,
  events: StoredEvent[],
): Promise<void> {
  if (!/^\d+$/.test(accountId) || !/^\d+$/.test(targetBlockNumber)) {
    throw new Error("Invalid historical sync parameters");
  }

  if (events.length > 100) {
    throw new Error("Historical batch exceeds safety limit");
  }


  const compareCursor = (
    a: HistoricalCursor,
    b: HistoricalCursor,
  ): number => {
    const blockA = BigInt(a.blockNumber);
    const blockB = BigInt(b.blockNumber);

    if (blockA !== blockB) return blockA < blockB ? -1 : 1;
    if (a.logIndex !== b.logIndex) {
      return a.logIndex < b.logIndex ? -1 : 1;
    }
    return a.id.localeCompare(b.id);
  };

  let previous = expectedCursor;

  for (const event of events) {
    if (
      event.accountId !== accountId ||
      typeof event.id !== "string" ||
      !/^\d+$/.test(event.blockNumber) ||
      !Number.isSafeInteger(event.logIndex) ||
      event.logIndex < 0 ||
      typeof event.transactionHash !== "string" ||
      BigInt(event.blockNumber) > BigInt(targetBlockNumber)
    ) {
      throw new Error("Invalid historical event");
    }

    const current: HistoricalCursor = {
      blockNumber: event.blockNumber,
      logIndex: event.logIndex,
      id: event.id,
    };

    if (previous && compareCursor(current, previous) <= 0) {
      throw new Error("Historical events are not strictly ordered");
    }

    previous = current;
  }

  const sql = getPerplDb();

  const result = await sql`
    SELECT perpl_commit_historical_batch(
      ${accountId},
      ${eventType},
      ${expectedCursor?.blockNumber ?? null}::numeric,
      ${expectedCursor?.logIndex ?? null},
      ${expectedCursor?.id ?? null},
      ${targetBlockNumber}::numeric,
      ${JSON.stringify(events)}::jsonb
    ) AS inserted_count
  `;

  if (result.length !== 1) {
    throw new Error("Historical batch commit failed");
  }
}
