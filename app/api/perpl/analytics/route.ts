import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";

import {
  HistoricalDataUnavailableError,
  fetchHistoricalRows,
} from "@/app/lib/perpl-historical-client";
import { buildHistoricalTraderAnalytics } from "@/app/lib/perpl-historical-analytics";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const cachedHistoricalRows = unstable_cache(
  async (accountId: string) => fetchHistoricalRows(accountId),
  ["perpl-historical-rows-v1"],
  { revalidate: 30 },
);

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
    const rows = await cachedHistoricalRows(accountId);
    const result = buildHistoricalTraderAnalytics(rows);

    return NextResponse.json({
      status: "ok",
      accountId,
      indexedLifecycleEvents:
        rows.positionOpens.length +
        rows.positionIncreases.length +
        rows.positionDecreases.length +
        rows.positionCloses.length +
        rows.positionInverts.length +
        rows.positionLiquidations.length,
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
    if (error instanceof HistoricalDataUnavailableError) {
      return NextResponse.json(
        {
          status: "unavailable",
          accountId,
          error: error.message,
        },
        { status: 503 },
      );
    }

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
