import { NextRequest, NextResponse } from "next/server";
import { findRecentTradeCandidates } from "@/app/lib/perpl-recent-candidates";
import { fetchLifecycleBlockRange } from "@/app/lib/perpl-recent-events";
import { fetchHistoricalTakerFills } from "@/app/lib/perpl-historical-fills";
import { historicalRowsToEngine } from "@/app/lib/perpl-historical-analytics";
import {
  reconstructPositionLifecycles,
  attributeTakerFills,
  buildCompletedTrades,
  calculateTraderAnalytics,
} from "@/app/lib/perpl-trade-reconstruction";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const recentTradesCache = new Map<string, {
  expiresAt: number;
  payload: unknown;
}>();


export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("accountId") ?? "";

  if (!/^\d+$/.test(accountId)) {
    return NextResponse.json(
      { status: "invalid_request" },
      { status: 400 },
    );
  }

  const cached = recentTradesCache.get(accountId);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.payload);
  }

  try {
    let candidates;
    try {
      candidates = await findRecentTradeCandidates(accountId);
    } catch {
      candidates = await findRecentTradeCandidates(accountId);
    }
    const verified = [];

    for (const candidate of candidates.slice(0, 1)) {
      const rows = await fetchLifecycleBlockRange(
        accountId,
        candidate.fromBlock,
        candidate.toBlock,
      );

      const hashes = [...new Set(
        Object.values(rows).flat().map((event) => event.transactionHash),
      )];

      rows.takerOrderFills = hashes.length
        ? await fetchHistoricalTakerFills(hashes)
        : [];

      const { lifecycleEvents, takerFills } = historicalRowsToEngine(rows);
      const lifecycles = reconstructPositionLifecycles(lifecycleEvents);
      const attributedFills = attributeTakerFills(
        lifecycleEvents,
        takerFills,
      );

      const trades = buildCompletedTrades({
        lifecycles,
        lifecycleEvents,
        attributedFills,
      });

      verified.push(...trades.filter(
        (trade) => trade.perpId.toString() === candidate.perpId,
      ));
    }

    const unique = [...new Map(
      verified.map((trade) => [
        `${trade.accountId}:${trade.perpId}:${trade.openedAt}:${trade.closedAt}`,
        trade,
      ]),
    ).values()];

    const analytics = calculateTraderAnalytics(unique);

    const payload = JSON.parse(JSON.stringify({
        status: "ok",
        scope: "recent_sample",
        isFullHistory: false,
        accountId,
        candidateCount: candidates.length,
        analytics,
        trades: unique,
      }, (_, value) => typeof value === "bigint" ? value.toString() : value));

    recentTradesCache.set(accountId, {
      expiresAt: Date.now() + 300_000,
      payload,
    });

    return NextResponse.json(payload,
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    console.error("Recent trades verification failed:", error);

    return NextResponse.json(
      {
        status: "verification_unavailable",
        error: "Recent trades could not be verified",
      },
      { status: 503 },
    );
  }
}
