"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";

type Trade = {
  closedAt: string;
  netPnlCNS: string;
};

type Analytics = {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  profitFactor: number | null;
  totalNetPnlCNS: string;
};

function toCNS(value: string): number {
  return Number(BigInt(value)) / 1_000_000;
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

export default function TraderPerformance({
  trades,
  analytics,
}: {
  trades: Trade[];
  analytics: Analytics;
}) {
  const chartData = useMemo(() => {
    const ordered = [...trades].sort((a, b) => {
      const aTime = BigInt(a.closedAt);
      const bTime = BigInt(b.closedAt);
      return aTime < bTime ? -1 : aTime > bTime ? 1 : 0;
    });

    let cumulative = 0;

    return [
      { trade: "Start", pnl: 0 },
      ...ordered.map((trade, index) => {
        cumulative += toCNS(trade.netPnlCNS);
        return {
          trade: `#${index + 1}`,
          pnl: cumulative,
        };
      }),
    ];
  }, [trades]);

  const cards = [
    {
      label: "Win Rate",
      value:
        analytics.winRate === null
          ? "N/A"
          : `${formatNumber(analytics.winRate * 100)}%`,
    },
    {
      label: "Profit Factor",
      value:
        analytics.profitFactor === null
          ? "N/A"
          : formatNumber(analytics.profitFactor),
    },
    {
      label: "Net Realized PnL",
      value: `${formatNumber(
        toCNS(analytics.totalNetPnlCNS),
      )} CNS`,
    },
    {
      label: "Verified Trades",
      value: String(analytics.totalTrades),
    },
  ];

  return (
    <div className="space-y-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div>
        <h4 className="text-sm font-semibold text-white">
          Trader Performance
        </h4>
        <p className="mt-1 text-xs text-amber-300">
          Verified recent sample only — not lifetime performance.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-white/10 bg-black/20 p-3"
          >
            <p className="text-xs text-zinc-500">
              {card.label}
            </p>
            <p className="mt-2 break-words text-lg font-semibold text-white">
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {trades.length > 0 && (
        <div className="rounded-lg border border-white/10 p-3">
          <div className="mb-4">
            <h5 className="text-sm font-medium text-white">
              Cumulative Realized PnL
            </h5>
            <p className="text-xs text-zinc-500">
              Ordered by trade closing time · CNS
            </p>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  stroke="#27272a"
                  strokeDasharray="3 3"
                />
                <XAxis
                  dataKey="trade"
                  stroke="#71717a"
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  stroke="#71717a"
                  tick={{ fontSize: 11 }}
                  width={65}
                  tickFormatter={(value: number) =>
                    formatNumber(value)
                  }
                />
                <Tooltip
                  formatter={(value) => [
                    `${formatNumber(Number(value))} CNS`,
                    "Cumulative PnL",
                  ]}
                  contentStyle={{
                    backgroundColor: "#09090b",
                    border: "1px solid #3f3f46",
                    borderRadius: "8px",
                  }}
                />
                <ReferenceLine
                  y={0}
                  stroke="#71717a"
                  strokeDasharray="4 4"
                />
                <Line
                  type="linear"
                  dataKey="pnl"
                  stroke="#22d3ee"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <p className="text-xs text-zinc-500">
        Statistics are calculated from {trades.length} verified
        completed trades in the available recent sample.
        They do not represent the wallet's complete trading history.
      </p>
    </div>
  );
}
