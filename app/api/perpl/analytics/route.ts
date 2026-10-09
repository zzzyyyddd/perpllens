import { NextRequest, NextResponse } from "next/server";
import { buildHistoricalAnalyticsFromDb } from "@/app/lib/perpl-historical-db-analytics";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function bigintString(value: bigint): string {
  return value.toString();
}

export async function GET(request: NextRequest) {
  const accountId =
    request.nextUrl.searchParams.get("accountId")?.trim() ?? "";

  if (!/^\d+$/.test(accountId)) {
    return NextResponse.json(
      {
        status: "invalid_request",
        error: "A valid numeric Perpl accountId is required",
      },
      { status: 400 },
    );
  }

  try {
    const historical = await buildHistoricalAnalyticsFromDb(accountId);

    if (historical.status === "syncing") {
      return NextResponse.json(
        {
          status: "syncing",
          accountId,
          completedCategories: historical.completedCategories,
          totalCategories: 6,
          totalHashes: historical.totalHashes,
          checkedHashes: historical.checkedHashes,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const result = historical.analytics;

    return NextResponse.json({
      status: "ok",
      accountId,
      indexedLifecycleEvents: historical.indexedLifecycleEvents,
      analytics: {
        totalTrades: result.analytics.totalTrades,
        wins: result.analytics.wins,
        losses: result.analytics.losses,
        breakeven: result.analytics.breakeven,
        winRate: result.analytics.winRate,
        totalNetPnlCNS: bigintString(
          result.analytics.totalNetPnlCNS,
        ),
        grossProfitCNS: bigintString(
          result.analytics.grossProfitCNS,
        ),
        grossLossCNS: bigintString(
          result.analytics.grossLossCNS,
        ),
        profitFactor: result.analytics.profitFactor,
        bestTradeCNS:
          result.analytics.bestTradeCNS === null
            ? null
            : bigintString(result.analytics.bestTradeCNS),
        worstTradeCNS:
          result.analytics.worstTradeCNS === null
            ? null
            : bigintString(result.analytics.worstTradeCNS),
        averageHoldingTimeSeconds:
          result.analytics.averageHoldingTimeSeconds,
        longestWinningStreak:
          result.analytics.longestWinningStreak,
        longestLosingStreak:
          result.analytics.longestLosingStreak,
        maxRealizedDrawdownCNS: bigintString(
          result.realizedDrawdown.maxDrawdownCNS,
        ),
      },
      trades: result.trades.map((trade) => ({
        accountId: bigintString(trade.accountId),
        perpId: bigintString(trade.perpId),
        side: trade.side,
        openedAt: bigintString(trade.openedAt),
        closedAt: bigintString(trade.closedAt),
        holdingTimeSeconds: bigintString(
          trade.holdingTimeSeconds,
        ),
        grossPnlCNS: bigintString(trade.grossPnlCNS),
        fundingCNS: bigintString(trade.fundingCNS),
        takerFeesCNS: bigintString(trade.takerFeesCNS),
        netPnlCNS: bigintString(trade.netPnlCNS),
        outcome: trade.outcome,
        finalReason: trade.finalReason,
      })),
    });
  } catch (error) {
    console.error("Historical analytics failed", error);

    return NextResponse.json(
      {
        status: "error",
        accountId,
        error: "Historical analytics could not be calculated",
      },
      { status: 500 },
    );
  }
}
