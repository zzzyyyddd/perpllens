import "server-only";

import { getPerplDb } from "./perpl-db";
import {
  HISTORICAL_EVENT_KEYS,
  HISTORICAL_EVENT_TYPES,
} from "./perpl-historical-sync-types";
import type { HistoricalRows } from "./perpl-historical-analytics";

type LifecycleRows = Omit<HistoricalRows, "takerOrderFills">;

export async function readHistoricalLifecycleFromDb(
  accountId: string,
): Promise<LifecycleRows> {
  if (!/^\d+$/.test(accountId)) {
    throw new Error("Invalid Perpl account ID");
  }

  const sql = getPerplDb();

  const rows = await sql`
    SELECT event_type, payload
    FROM perpl_historical_events
    WHERE account_id = ${accountId}
    ORDER BY block_number ASC, log_index ASC, event_id ASC
  `;

  const result: LifecycleRows = {
    positionOpens: [],
    positionIncreases: [],
    positionDecreases: [],
    positionCloses: [],
    positionInverts: [],
    positionLiquidations: [],
  };

  for (const row of rows) {
    const eventType = String(row.event_type);

    if (
      !HISTORICAL_EVENT_TYPES.some(
        (type) => type === eventType,
      )
    ) {
      throw new Error("Unknown historical event type");
    }

    const key =
      HISTORICAL_EVENT_KEYS[
        eventType as (typeof HISTORICAL_EVENT_TYPES)[number]
      ];

    const payload = row.payload as Record<string, unknown>;

    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid historical event payload");
    }

    // Payload berasal dari event Envio yang sudah divalidasi
    // saat disimpan melalui historical worker.
    (result[key] as Array<typeof payload>).push(payload);
  }

  return result;
}
