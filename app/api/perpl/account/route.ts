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
