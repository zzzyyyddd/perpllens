import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type PositionOpenEvent = {
  id: string;
  perpId: string;
  positionType: number;
  timestamp: string;
};

type GraphQLResult = {
  data?: {
    PositionOpen: PositionOpenEvent[];
  };
  errors?: { message: string }[];
};

const PAGE_SIZE = 500;
const MAX_PAGES = 40;

const QUERY = `
  query RecentPositionOpens($since: numeric!, $until: numeric!, $limit: Int!, $offset: Int!) {
    PositionOpen(
      where: { timestamp: { _gte: $since, _lt: $until } }
      order_by: [{ timestamp: desc }, { logIndex: desc }, { id: desc }]
      limit: $limit
      offset: $offset
    ) {
      id
      perpId
      positionType
      timestamp
    }
  }
`;

async function loadActivity() {
  const endpoint = process.env.ENVIO_GRAPHQL_URL?.trim();

  if (!endpoint || endpoint === "[SENSITIVE]") {
    throw new Error("Historical index unavailable");
  }

  const until = Math.floor(Date.now() / 1000);
  const since = until - 86400;

  try {
    const allEvents: PositionOpenEvent[] = [];
    let completed = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    try {

    for (let page = 0; page < MAX_PAGES; page++) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: QUERY,
          variables: {
            since: String(since),
            until: String(until),
            limit: PAGE_SIZE,
            offset: page * PAGE_SIZE,
          },
        }),
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Envio HTTP ${response.status}`);
      }

      const payload = (await response.json()) as GraphQLResult;

      if (payload.errors?.length || !payload.data) {
        throw new Error("Envio GraphQL query failed");
      }

      const events = payload.data.PositionOpen;

      if (!Array.isArray(events) || events.length > PAGE_SIZE) {
        throw new Error("Invalid position activity response");
      }

      allEvents.push(...events);

      if (events.length < PAGE_SIZE) {
        completed = true;
        break;
      }
    }

    } finally {
      clearTimeout(timeout);
    }

    if (!completed) {
      throw new Error("Position activity exceeds safe pagination limit");
    }

    const events = allEvents;

    const byMarket: Record<
      string,
      { long: number; short: number; total: number }
    > = {};

    let totalLong = 0;
    let totalShort = 0;

    for (const event of events) {
      if (
        !event.perpId ||
        !Number.isInteger(event.positionType) ||
        (event.positionType !== 0 && event.positionType !== 1)
      ) {
        throw new Error("Unexpected position activity data");
      }

      const marketId = event.perpId;

      if (!byMarket[marketId]) {
        byMarket[marketId] = {
          long: 0,
          short: 0,
          total: 0,
        };
      }

      if (event.positionType === 0) {
        totalLong += 1;
        byMarket[marketId].long += 1;
      } else {
        totalShort += 1;
        byMarket[marketId].short += 1;
      }

      byMarket[marketId].total += 1;
    }

    return {
      status: "ok",
      windowHours: 24,
      updatedAt: new Date().toISOString(),
      totalOpens: totalLong + totalShort,
      long: totalLong,
      short: totalShort,
      byMarket,
    };
  } catch (error) {
    console.error("Long/short activity unavailable:", error);

    throw error;
  }
}

const cachedActivity = unstable_cache(
  loadActivity,
  ["perpl-long-short-activity-v1"],
  { revalidate: 60 },
);

export async function GET() {
  try {
    const data = await cachedActivity();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      {
        status: "unavailable",
        error: "Long/short activity temporarily unavailable",
      },
      { status: 503 },
    );
  }
}
