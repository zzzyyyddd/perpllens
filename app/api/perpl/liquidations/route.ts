
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type LiquidationEvent = {
  id: string;
  accountId: string;
  perpId: string;
  positionType: number;
  timestamp: string;
  transactionHash: string;
};

type GraphQLResult = {
  data?: {
    PositionLiquidation: LiquidationEvent[];
  };
  errors?: { message: string }[];
};

const QUERY = `
  query RecentLiquidations($since: numeric!, $limit: Int!) {
    PositionLiquidation(
      where: { timestamp: { _gte: $since } }
      order_by: [{ timestamp: desc }, { logIndex: desc }]
      limit: $limit
    ) {
      id
      accountId
      perpId
      positionType
      timestamp
      transactionHash
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

  const now = Math.floor(Date.now() / 1000);
  const since = now - 24 * 60 * 60;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: QUERY,
        variables: {
          since: String(since),
          limit: 1000,
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

    const events = payload.data.PositionLiquidation;

    if (!Array.isArray(events)) {
      throw new Error("Invalid liquidation response");
    }

    // Never report truncated results as a complete 24h total.
    if (events.length === 1000) {
      return NextResponse.json(
        {
          status: "unavailable",
          error: "Liquidation result exceeds safe query limit",
        },
        { status: 503 },
      );
    }

    const byMarket: Record<string, number> = {};

    for (const event of events) {
      byMarket[event.perpId] = (byMarket[event.perpId] ?? 0) + 1;
    }

    return NextResponse.json({
      status: "ok",
      windowHours: 24,
      updatedAt: new Date().toISOString(),
      totalLiquidations: events.length,
      byMarket,
      recent: events.slice(0, 10),
    });
  } catch (error) {
    console.error("Liquidation analytics unavailable:", error);

    return NextResponse.json(
      {
        status: "unavailable",
        error: "Liquidation analytics temporarily unavailable",
      },
      { status: 503 },
    );
  }
}
