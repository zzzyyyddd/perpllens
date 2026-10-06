import { NextResponse } from "next/server";
import { perplAuthenticatedGet } from "@/app/lib/perpl-auth";

export const dynamic = "force-dynamic";

type PerplAccount = {
  id?: number;
  b?: string;
  lb?: string;
};

type PerplStats = {
  id?: number;
  td?: string;
  tw?: string;
  tf?: string;
  trp?: string;
  tt?: number;
};

type PerplWallet = {
  addr?: string;
  as?: PerplAccount[];
  sts?: PerplStats[];
  [key: string]: unknown;
};

type PerplCollection = {
  d?: unknown[];
  [key: string]: unknown;
};

type PerplHistoryRecord = {
  at?: {
    t?: number;
  };
  mkt?: number;
  pid?: number;
  st?: number;
  sd?: number;
  ep?: number;
  s?: number;
  fee?: string;
  cfee?: string;
  lv?: number;
  dpnl?: string;
  fnd?: string;
  pay?: string;
  xp?: number;
  rq?: number;
};

function ausd(raw: string | undefined) {
  if (!raw) return 0;
  return Number(raw) / 1_000_000;
}

export async function GET() {
  try {
    const [walletRaw, positionsRaw, fillsRaw, historyRaw] = await Promise.all([
      perplAuthenticatedGet("/v1/trading/wallet"),
      perplAuthenticatedGet("/v1/trading/positions"),
      perplAuthenticatedGet("/v1/trading/fills?count=50"),
      perplAuthenticatedGet("/v1/trading/position-history"),
    ]);

    const wallet = walletRaw as PerplWallet;
    const positions = positionsRaw as PerplCollection;
    const fills = fillsRaw as PerplCollection;
    const history = historyRaw as PerplCollection;

    const historyRecords = Array.isArray(history.d)
      ? (history.d as PerplHistoryRecord[])
      : [];

    const closedTrades = historyRecords
      .filter(
        (item) =>
          item.st === 2 &&
          typeof item.ep === "number" &&
          typeof item.xp === "number"
      )
      .map((item) => {
        const grossPnl = ausd(item.dpnl);
        const totalFees = ausd(item.fee);
        const netPnl =
          grossPnl -
          totalFees +
          ausd(item.fnd) +
          ausd(item.pay);

        const opened = historyRecords.find(
          (candidate) =>
            candidate.pid === item.pid &&
            candidate.st === 1 &&
            typeof candidate.at?.t === "number"
        );

        const openedAt = opened?.at?.t ?? null;
        const closedAt = item.at?.t ?? null;

        const holdingTimeSeconds =
          openedAt !== null && closedAt !== null
            ? Math.max(0, Math.round((closedAt - openedAt) / 1000))
            : null;

        return {
          positionId: item.pid ?? null,
          marketId: item.mkt ?? null,
          side: item.sd === 1 ? "LONG" : item.sd === 2 ? "SHORT" : "UNKNOWN",
          size: item.s ?? null,
          leverage: typeof item.lv === "number" ? item.lv / 100 : null,
          entryPriceRaw: item.ep ?? null,
          exitPriceRaw: item.xp ?? null,
          grossPnl,
          fees: totalFees,
          netPnl,
          holdingTimeSeconds,
          openedAt,
          closedAt,
        };
      });

    const wins = closedTrades.filter((trade) => trade.netPnl > 0).length;
    const losses = closedTrades.filter((trade) => trade.netPnl < 0).length;

    const totalGrossPnl = closedTrades.reduce(
      (sum, trade) => sum + trade.grossPnl,
      0
    );

    const totalFees = closedTrades.reduce(
      (sum, trade) => sum + trade.fees,
      0
    );

    const totalNetPnl = closedTrades.reduce(
      (sum, trade) => sum + trade.netPnl,
      0
    );

    const holdingTimes = closedTrades
      .map((trade) => trade.holdingTimeSeconds)
      .filter((value): value is number => value !== null);

    const averageHoldingTimeSeconds =
      holdingTimes.length > 0
        ? Math.round(
            holdingTimes.reduce((sum, value) => sum + value, 0) /
              holdingTimes.length
          )
        : null;

    const account = wallet.as?.[0];
    const stats = wallet.sts?.find((item) => item.id === account?.id);

    const collateral = ausd(account?.b);
    const lockedCollateral = ausd(account?.lb);

    return NextResponse.json(
      {
        account: {
          address: wallet.addr ?? null,
          accountId: account?.id ?? null,
          collateral,
          lockedCollateral,
          availableCollateral: Math.max(
            0,
            collateral - lockedCollateral
          ),
          totalDeposited: ausd(stats?.td),
          totalWithdrawn: ausd(stats?.tw),
          realizedPnl: ausd(stats?.trp),
          tradingFees: ausd(stats?.tf),
          tradeCount: stats?.tt ?? 0,
        },

        activity: {
          openPositionCount: Array.isArray(positions.d)
            ? positions.d.length
            : 0,
          returnedFillCount: Array.isArray(fills.d)
            ? fills.d.length
            : 0,
        },

        positions: Array.isArray(positions.d)
          ? positions.d
          : [],

        fills: Array.isArray(fills.d)
          ? fills.d
          : [],

        performance: {
          completedTrades: closedTrades.length,
          wins,
          losses,
          winRate:
            closedTrades.length > 0
              ? (wins / closedTrades.length) * 100
              : null,
          totalGrossPnl,
          totalFees,
          totalNetPnl,
          averageHoldingTimeSeconds,
          bestTrade:
            closedTrades.length > 0
              ? Math.max(...closedTrades.map((trade) => trade.netPnl))
              : null,
          worstTrade:
            closedTrades.length > 0
              ? Math.min(...closedTrades.map((trade) => trade.netPnl))
              : null,
        },

        closedTrades,

        positionHistory: historyRaw,

        updatedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error(
      "Perpl account API error:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return NextResponse.json(
      {
        error: "Unable to load Perpl account data",
      },
      { status: 502 }
    );
  }
}
