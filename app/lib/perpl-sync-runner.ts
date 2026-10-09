import "server-only";

import { randomUUID } from "node:crypto";

import { getPerplDb } from "@/app/lib/perpl-db";
import { getSharedHistoricalSnapshot } from "@/app/lib/perpl-shared-snapshot";
import { syncHistoricalEventBatch } from "@/app/lib/perpl-historical-worker";
import { syncHistoricalFillBatch } from "@/app/lib/perpl-historical-fill-worker";
import { HISTORICAL_EVENT_TYPES } from "@/app/lib/perpl-historical-sync-types";

export async function runPerplSyncBatch(accountId: string) {
  if (!/^\d{1,20}$/.test(accountId)) {
    throw new Error("Invalid account ID");
  }

  const sql = getPerplDb();
  const leaseToken = randomUUID();

  const leaseRows = await sql`
    SELECT perpl_acquire_worker_lease(
      ${accountId},
      ${leaseToken}::uuid
    ) AS acquired
  `;

  if (leaseRows[0]?.acquired !== true) {
    return { status: "busy", accountId };
  }

  try {
    const sharedTarget =
      await getSharedHistoricalSnapshot(accountId);

    const checkpoints = await sql`
      SELECT
        event_type,
        completed,
        target_block_number::text AS target
      FROM perpl_historical_sync
      WHERE account_id = ${accountId}
    `;

    const incomplete = HISTORICAL_EVENT_TYPES.find(
      (eventType) =>
        !checkpoints.some(
          (row) =>
            row.event_type === eventType &&
            row.completed === true &&
            row.target !== null &&
            BigInt(String(row.target)) === BigInt(sharedTarget),
        ),
    );

    if (incomplete) {
      const result = await syncHistoricalEventBatch(
        accountId,
        incomplete,
      );

      return {
        accountId,
        phase: "lifecycle",
        eventType: incomplete,
        ...result,
      };
    }

    const result = await syncHistoricalFillBatch(accountId);

    return {
      accountId,
      phase: "fills",
      ...result,
    };
  } finally {
    await sql`
      SELECT perpl_release_worker_lease(
        ${accountId},
        ${leaseToken}::uuid
      )
    `;
  }
}
