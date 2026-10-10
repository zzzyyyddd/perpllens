import { NextRequest, NextResponse } from "next/server";

import { fetchPerplEnvio } from "@/app/lib/perpl-envio-fetch";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const EVENT_TYPES = [
  "PositionOpen",
  "PositionIncrease",
  "PositionDecrease",
  "PositionClose",
  "PositionInvert",
  "PositionLiquidation",
] as const;

const EVENT_FIELDS = [
  "perpId",
  "positionType",
  "timestamp",
  "blockNumber",
  "logIndex",
  "transactionHash",
];

type RecentEvent = {
  id: string;
  accountId: string;
  perpId: string;
  positionType: number;
  timestamp: string;
  blockNumber: string;
  logIndex: number;
  transactionHash: string;
  eventType: string;
};

async function fetchRecentEvents(
  endpoint: string,
  accountId: string,
  eventType: (typeof EVENT_TYPES)[number],
): Promise<RecentEvent[]> {
  const query = `
    query RecentActivity($where: ${eventType}_bool_exp!) {
      events: ${eventType}(
        where: $where
        order_by: [
          { blockNumber: desc }
          { logIndex: desc }
          { id: desc }
        ]
        limit: 10
      ) {
        id
        accountId
        ${EVENT_FIELDS.join("\n")}
      }
    }
  `;

  const response = await fetchPerplEnvio(
    endpoint,
    {
      query,
      variables: {
        where: { accountId: { _eq: accountId } },
      },
    },
    8000,
  );

  if (!response.ok) {
    throw new Error(`Envio HTTP ${response.status}`);
  }

  const payload = (await response.json()) as {
    data?: { events?: RecentEvent[] };
    errors?: Array<{ message?: string }>;
  };

  if (payload.errors?.length) {
    throw new Error(
      payload.errors[0]?.message ?? "Envio query failed",
    );
  }

  if (!Array.isArray(payload.data?.events)) {
    throw new Error("Invalid Envio response");
  }

  return payload.data.events.map((event) => ({
    ...event,
    eventType,
  }));
}

export async function GET(request: NextRequest) {
  const accountId =
    request.nextUrl.searchParams.get("accountId")?.trim() ?? "";

  if (!/^\d{1,20}$/.test(accountId)) {
    return NextResponse.json(
      { status: "invalid_request" },
      { status: 400 },
    );
  }

  const endpoint = process.env.ENVIO_GRAPHQL_URL?.trim();

  if (!endpoint) {
    return NextResponse.json(
      { status: "unavailable" },
      { status: 503 },
    );
  }

  try {
    const results = await Promise.allSettled(
      EVENT_TYPES.map((eventType) =>
        fetchRecentEvents(endpoint, accountId, eventType),
      ),
    );

    const failures = results.flatMap((result, index) =>
      result.status === "rejected"
        ? [{
            eventType: EVENT_TYPES[index],
            reason: String(result.reason),
          }]
        : [],
    );

    if (failures.length > 0) {
      console.error("Recent activity partial failures:", failures);
    }

    const batches = results.map((result) =>
      result.status === "fulfilled" ? result.value : [],
    );

    if (failures.length === EVENT_TYPES.length) {
      throw new Error("All recent activity queries failed");
    }

    const events = batches
      .flat()
      .sort((a, b) => {
        const blockA = BigInt(a.blockNumber);
        const blockB = BigInt(b.blockNumber);

        if (blockA !== blockB) {
          return blockA > blockB ? -1 : 1;
        }

        return b.logIndex - a.logIndex;
      })
      .slice(0, 50);

    const counts = Object.fromEntries(
      EVENT_TYPES.map((eventType, index) => [
        eventType,
        batches[index].length,
      ]),
    );

    return NextResponse.json(
      {
        status: "ok",
        accountId,
        sampleSize: events.length,
        counts,
        events,
        scope: "recent_sample",
        isFullHistory: false,
        isPartial: failures.length > 0,
        successfulCategories: EVENT_TYPES.length - failures.length,
        failedCategories: failures.map((failure) => failure.eventType),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("Recent Perpl activity failed:", error);

    return NextResponse.json(
      {
        status: "error",
        error: "Recent activity unavailable",
      },
      { status: 502 },
    );
  }
}
