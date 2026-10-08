import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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

const LIMIT = 1000;

const QUERY = `
  query RecentPositionOpens($since: numeric!, $limit: Int!) {
    PositionOpen(
      where: { timestamp: { _gte: $since } }
      order_by: [{ timestamp: desc }, { logIndex: desc }]
      limit: $limit
    ) {
      id
      perpId
      positionType
      timestamp
    }
  }
`;

export async function GET() {
  const endpoint = process.env.ENVIO_GRAPHQL_URL?.trim();

  if (!endpoint || endpoint === "[SENSITIVE]") {
    return NextResponse.json(
      { status: "unavailable", error: "Historical index unavailable" },
      { status: 503 },
    );
  }

  const since = Math.floor(Date.now() / 1000) - 86400;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: QUERY,
        variables: {
          since: String(since),
          limit: LIMIT,
        },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      throw new Error(`Envio HTTP ${response.status}`);
    }

    const payload = (await response.json()) as GraphQLResult;

    if (payload.errors?.length || !payload.data) {
      throw new Error("Envio GraphQL query failed");
    }

    const events = payload.data.PositionOpen;

    if (!Array.isArray(events)) {
      throw new Error("Invalid position activity response");
    }

    // Never report incomplete 24h results as complete.
    if (events.length >= LIMIT) {
      return NextResponse.json(
        {
          status: "unavailable",
          error: "Position activity exceeds safe query limit",
        },
        { status: 503 },
      );
    }

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

    return NextResponse.json({
      status: "ok",
      windowHours: 24,
      updatedAt: new Date().toISOString(),
      totalOpens: totalLong + totalShort,
      long: totalLong,
      short: totalShort,
      byMarket,
    });
  } catch (error) {
    console.error("Long/short activity unavailable:", error);

    return NextResponse.json(
      {
        status: "unavailable",
        error: "Long/short activity temporarily unavailable",
      },
      { status: 503 },
    );
  }
}
