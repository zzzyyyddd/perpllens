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
    // Avoid repeating the same expensive query immediately on failure.
    const candidates = await findRecentTradeCandidates(accountId);
    const verified = [];

    const selected = candidates.slice(0, 3);

    async function verifyRange(
      fromBlock: string,
      toBlock: string,
      allowedCandidates: Set<string>,
    ) {
      const rows = await fetchLifecycleBlockRange(
        accountId,
        fromBlock,
        toBlock,
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

      return buildCompletedTrades({
        lifecycles,
        lifecycleEvents,
        attributedFills,
      }).filter((trade) =>
        allowedCandidates.has(
          [
            trade.perpId.toString(),
            trade.openingTransactionHash.toLowerCase(),
            trade.closingTransactionHash.toLowerCase(),
          ].join(":"),
        )
      );
    }

    if (selected.length > 0) {
      const minBlock = selected.reduce(
        (min, c) => BigInt(c.fromBlock) < min
          ? BigInt(c.fromBlock) : min,
        BigInt(selected[0].fromBlock),
      );

      const maxBlock = selected.reduce(
        (max, c) => BigInt(c.toBlock) > max
          ? BigInt(c.toBlock) : max,
        BigInt(selected[0].toBlock),
      );

      if (maxBlock - minBlock <= BigInt(5000)) {
        verified.push(...await verifyRange(
          minBlock.toString(),
          maxBlock.toString(),
          new Set(selected.map((c) =>
            [
              c.perpId,
              c.openingTransactionHash.toLowerCase(),
              c.closingTransactionHash.toLowerCase(),
            ].join(":"),
          )),
        ));
      } else {
        for (const candidate of selected) {
          verified.push(...await verifyRange(
            candidate.fromBlock,
            candidate.toBlock,
            new Set([
              [
                candidate.perpId,
                candidate.openingTransactionHash.toLowerCase(),
                candidate.closingTransactionHash.toLowerCase(),
              ].join(":"),
            ]),
          ));
        }
      }
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
