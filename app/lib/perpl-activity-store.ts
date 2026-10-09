import "server-only";
import { getPerplDb } from "./perpl-db";

export type IndexedPositionOpen = {
  id: string;
  perpId: string;
  positionType: number;
  timestamp: string;
};

export async function storePositionOpens(events: IndexedPositionOpen[]) {
  if (events.length === 0) {
    return { received: 0, inserted: 0 };
  }

  if (events.length > 500) {
    throw new Error("Batch exceeds 500 events");
  }

  const seen = new Map<string, string>();

  const normalized = events.map((event) => {
    const timestamp = Number(event.timestamp);

    if (
      typeof event.id !== "string" ||
      event.id.length === 0 ||
      typeof event.perpId !== "string" ||
      !/^\d+$/.test(event.perpId) ||
      !Number.isSafeInteger(timestamp) ||
      timestamp <= 0 ||
      (event.positionType !== 0 && event.positionType !== 1)
    ) {
      throw new Error("Invalid position event");
    }

    const signature = `${event.perpId}:${event.positionType}:${timestamp}`;
    const previous = seen.get(event.id);

    if (previous !== undefined && previous !== signature) {
      throw new Error("Conflicting duplicate position event");
    }

    seen.set(event.id, signature);

    return {
      eventId: event.id,
      perpId: event.perpId,
      positionType: event.positionType,
      timestamp,
      hourStart: Math.floor(timestamp / 3600) * 3600,
    };
  });

  const db = getPerplDb();
  const payload = JSON.stringify(normalized);

  const rows = await db`
    WITH incoming AS (
      SELECT DISTINCT ON ("eventId")
        "eventId" AS event_id,
        "perpId" AS perp_id,
        "positionType" AS position_type,
        "timestamp" AS event_timestamp,
        "hourStart" AS hour_start
      FROM jsonb_to_recordset(${payload}::jsonb) AS x(
        "eventId" text,
        "perpId" text,
        "positionType" smallint,
        "timestamp" bigint,
        "hourStart" bigint
      )
      ORDER BY "eventId"
    ),
    inserted AS (
      INSERT INTO perpl_indexed_opens (
        event_id, hour_start, perp_id, position_type, event_timestamp
      )
      SELECT
        event_id, hour_start, perp_id, position_type, event_timestamp
      FROM incoming
      ON CONFLICT (event_id) DO NOTHING
      RETURNING hour_start, perp_id, position_type
    ),
    grouped AS (
      SELECT
        hour_start,
        perp_id,
        COUNT(*) FILTER (WHERE position_type = 0)::integer AS longs,
        COUNT(*) FILTER (WHERE position_type = 1)::integer AS shorts
      FROM inserted
      GROUP BY hour_start, perp_id
    ),
    aggregated AS (
      INSERT INTO perpl_hourly_activity (
        hour_start, perp_id, long_opens, short_opens
      )
      SELECT hour_start, perp_id, longs, shorts
      FROM grouped
      ON CONFLICT (hour_start, perp_id)
      DO UPDATE SET
        long_opens = perpl_hourly_activity.long_opens + EXCLUDED.long_opens,
        short_opens = perpl_hourly_activity.short_opens + EXCLUDED.short_opens,
        updated_at = NOW()
      RETURNING 1
    )
    SELECT
      (SELECT COUNT(*)::integer FROM inserted) AS inserted,
      (SELECT COUNT(*)::integer FROM aggregated) AS updated_groups
  `;

  return {
    received: events.length,
    inserted: Number(rows[0]?.inserted ?? 0),
  };
}
