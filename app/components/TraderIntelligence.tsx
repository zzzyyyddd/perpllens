"use client";

import { useCallback, useEffect, useState } from "react";

type ClosedTrade = {
  positionId: number | null;
  marketId: number | null;
  market: string;
  symbol: string | null;
  side: "LONG" | "SHORT" | "UNKNOWN";
  size: number | null;
  leverage: number | null;
  entryPrice: number | null;
  exitPrice: number | null;
  grossPnl: number;
  fees: number;
  netPnl: number;
  holdingTimeSeconds: number | null;
  openedAt: number | null;
  closedAt: number | null;
};

type Performance = {
  completedTrades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  totalGrossPnl: number;
  totalFees: number;
  totalNetPnl: number;
  averageHoldingTimeSeconds: number | null;
  bestTrade: number | null;
  worstTrade: number | null;
};

type AccountData = {
  account: {
    address: string | null;
    accountId: number | null;
    collateral: number;
    lockedCollateral: number;
    availableCollateral: number;
    totalDeposited: number;
    totalWithdrawn: number;
    realizedPnl: number;
    tradingFees: number;
    tradeCount: number;
  };
  activity: {
    openPositionCount: number;
    returnedFillCount: number;
  };
  performance: Performance;
  closedTrades: ClosedTrade[];
  positions: unknown[];
  fills: unknown[];
  updatedAt: string;
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function preciseMoney(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";

  const abs = Math.abs(value);
  const digits = abs > 0 && abs < 0.01 ? 6 : 2;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function price(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";

  const digits =
    Math.abs(value) < 0.01 ? 6 :
    Math.abs(value) < 1 ? 4 :
    2;

  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function duration(seconds: number | null) {
  if (seconds === null) return "—";

  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;

  if (minutes < 60) {
    return `${minutes}m ${remaining}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return `${hours}h ${remainingMinutes}m`;
}

function shortAddress(address: string | null) {
  if (!address) return "—";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function pnlTone(value: number | null) {
  if (value === null || value === 0) return "neutral" as const;
  return value > 0 ? "positive" as const : "negative" as const;
}

export default function TraderIntelligence() {
  const [data, setData] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAccount = useCallback(async () => {
    try {
      const response = await fetch("/api/perpl/account", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = (await response.json()) as AccountData;

      setData(result);
      setError("");
    } catch (err) {
      console.error("Failed to load trader intelligence:", err);
      setError("Unable to load authenticated trader data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccount();

    const interval = setInterval(loadAccount, 15_000);

    return () => clearInterval(interval);
  }, [loadAccount]);

  const account = data?.account;
  const performance = data?.performance;

  return (
    <section className="mb-10 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
      <div className="flex flex-col gap-3 border-b border-white/10 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-semibold">Trader Intelligence</h2>

            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-emerald-300">
              Authenticated
            </span>
          </div>

          <p className="mt-1 text-sm text-zinc-500">
            Live Perpl account activity, performance and collateral intelligence.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {account && (
            <div className="text-right text-xs">
              <p className="font-mono text-zinc-300">
                {shortAddress(account.address)}
              </p>
              <p className="mt-1 text-zinc-600">
                Account #{account.accountId ?? "—"}
              </p>
            </div>
          )}

          <button
            onClick={loadAccount}
            className="rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300 transition hover:bg-white/[0.05]"
          >
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="px-6 py-10 text-center text-sm text-red-400">
          {error}
        </div>
      ) : (
        <>
          <div className="grid gap-px bg-white/10 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Collateral"
              value={loading || !account ? "Loading..." : money(account.collateral)}
              sub="Perpl account balance"
            />

            <Metric
              label="Available"
              value={
                loading || !account
                  ? "Loading..."
                  : money(account.availableCollateral)
              }
              sub={
                account
                  ? `${preciseMoney(account.lockedCollateral)} locked`
                  : "Available collateral"
              }
            />

            <Metric
              label="Realized PnL"
              value={
                loading || !account
                  ? "Loading..."
                  : preciseMoney(account.realizedPnl)
              }
              sub={
                account
                  ? `${preciseMoney(account.tradingFees)} trading fees`
                  : "Realized trading result"
              }
              tone={account ? pnlTone(account.realizedPnl) : "neutral"}
            />

            <Metric
              label="Trading Activity"
              value={
                loading || !account
                  ? "Loading..."
                  : `${account.tradeCount} completed`
              }
              sub={
                data
                  ? `${data.activity.openPositionCount} open · ${data.activity.returnedFillCount} fills`
                  : "Account activity"
              }
            />
          </div>

          <div className="border-t border-white/10 px-6 py-6">
            <div className="mb-4">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                Performance Analytics
              </p>
              <p className="mt-1 text-xs text-zinc-600">
                Derived from completed Perpl position history.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <MiniMetric
                label="Completed"
                value={performance ? String(performance.completedTrades) : "—"}
              />

              <MiniMetric
                label="Win Rate"
                value={
                  performance?.winRate == null
                    ? "—"
                    : `${performance.winRate.toFixed(1)}%`
                }
              />

              <MiniMetric
                label="Net PnL"
                value={
                  performance
                    ? preciseMoney(performance.totalNetPnl)
                    : "—"
                }
                tone={
                  performance
                    ? pnlTone(performance.totalNetPnl)
                    : "neutral"
                }
              />

              <MiniMetric
                label="Avg Hold"
                value={
                  performance
                    ? duration(performance.averageHoldingTimeSeconds)
                    : "—"
                }
              />

              <MiniMetric
                label="Best Trade"
                value={
                  performance
                    ? preciseMoney(performance.bestTrade)
                    : "—"
                }
                tone={
                  performance
                    ? pnlTone(performance.bestTrade)
                    : "neutral"
                }
              />

              <MiniMetric
                label="Worst Trade"
                value={
                  performance
                    ? preciseMoney(performance.worstTrade)
                    : "—"
                }
                tone={
                  performance
                    ? pnlTone(performance.worstTrade)
                    : "neutral"
                }
              />
            </div>
          </div>

          <div className="border-t border-white/10">
            <div className="flex items-center justify-between px-6 py-5">
              <div>
                <h3 className="text-sm font-medium">Recent Trades</h3>
                <p className="mt-1 text-xs text-zinc-600">
                  Completed positions from authenticated Perpl history.
                </p>
              </div>

              <span className="text-xs text-zinc-600">
                {data?.closedTrades.length ?? 0} loaded
              </span>
            </div>

            {data && data.closedTrades.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left">
                  <thead className="border-y border-white/10 text-[10px] uppercase tracking-wider text-zinc-600">
                    <tr>
                      <th className="px-6 py-3 font-medium">Market</th>
                      <th className="px-4 py-3 font-medium">Side</th>
                      <th className="px-4 py-3 font-medium">Size</th>
                      <th className="px-4 py-3 font-medium">Entry</th>
                      <th className="px-4 py-3 font-medium">Exit</th>
                      <th className="px-4 py-3 font-medium">Hold</th>
                      <th className="px-4 py-3 font-medium">Fees</th>
                      <th className="px-6 py-3 font-medium">Net PnL</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-white/[0.06]">
                    {data.closedTrades.slice(0, 10).map((trade) => (
                      <tr key={trade.positionId ?? `${trade.marketId}-${trade.closedAt}`}>
                        <td className="px-6 py-4">
                          <p className="font-medium text-zinc-200">
                            {trade.market}
                          </p>
                          <p className="mt-1 text-xs text-zinc-600">
                            {trade.leverage ?? "—"}x
                          </p>
                        </td>

                        <td className="px-4 py-4">
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-medium ${
                              trade.side === "LONG"
                                ? "bg-emerald-400/10 text-emerald-300"
                                : trade.side === "SHORT"
                                  ? "bg-red-400/10 text-red-300"
                                  : "bg-white/5 text-zinc-400"
                            }`}
                          >
                            {trade.side}
                          </span>
                        </td>

                        <td className="px-4 py-4 font-mono text-sm text-zinc-300">
                          {trade.size ?? "—"} {trade.symbol ?? ""}
                        </td>

                        <td className="px-4 py-4 font-mono text-sm text-zinc-300">
                          {price(trade.entryPrice)}
                        </td>

                        <td className="px-4 py-4 font-mono text-sm text-zinc-300">
                          {price(trade.exitPrice)}
                        </td>

                        <td className="px-4 py-4 font-mono text-sm text-zinc-400">
                          {duration(trade.holdingTimeSeconds)}
                        </td>

                        <td className="px-4 py-4 font-mono text-sm text-zinc-400">
                          {preciseMoney(trade.fees)}
                        </td>

                        <td
                          className={`px-6 py-4 font-mono text-sm font-medium ${
                            trade.netPnl > 0
                              ? "text-emerald-400"
                              : trade.netPnl < 0
                                ? "text-red-400"
                                : "text-zinc-300"
                          }`}
                        >
                          {preciseMoney(trade.netPnl)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="border-t border-white/10 px-6 py-8 text-center text-sm text-zinc-600">
                No completed trades yet.
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-white/10 px-6 py-4 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Deposited{" "}
              <span className="font-mono text-zinc-300">
                {account ? money(account.totalDeposited) : "—"}
              </span>
              {" · "}
              Withdrawn{" "}
              <span className="font-mono text-zinc-300">
                {account ? money(account.totalWithdrawn) : "—"}
              </span>
            </span>

            <span>
              {data?.updatedAt
                ? `Updated ${new Date(data.updatedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}`
                : "Waiting for account data"}
            </span>
          </div>
        </>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  const valueClass =
    tone === "positive"
      ? "text-emerald-400"
      : tone === "negative"
        ? "text-red-400"
        : "text-white";

  return (
    <div className="bg-[#0b0e12] p-5">
      <p className="text-xs uppercase tracking-[0.14em] text-zinc-600">
        {label}
      </p>
      <p className={`mt-3 text-xl font-semibold ${valueClass}`}>
        {value}
      </p>
      <p className="mt-2 text-xs text-zinc-600">{sub}</p>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  const valueClass =
    tone === "positive"
      ? "text-emerald-400"
      : tone === "negative"
        ? "text-red-400"
        : "text-zinc-200";

  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
      <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-600">
        {label}
      </p>
      <p className={`mt-2 font-mono text-sm font-medium ${valueClass}`}>
        {value}
      </p>
    </div>
  );
}
