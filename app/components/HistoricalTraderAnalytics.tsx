"use client";

import { useEffect, useRef, useState } from "react";

type HistoricalTrade = {
  accountId: string;
  perpId: string;
  side: 0 | 1;
  openedAt: string;
  closedAt: string;
  holdingTimeSeconds: string;
  grossPnlCNS: string;
  fundingCNS: string;
  takerFeesCNS: string;
  netPnlCNS: string;
  outcome: "win" | "loss" | "breakeven";
  finalReason: "close" | "invert" | "liquidation";
};

type HistoricalAnalytics = {
  totalTrades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number | null;
  totalNetPnlCNS: string;
  grossProfitCNS: string;
  grossLossCNS: string;
  profitFactor: number | null;
  bestTradeCNS: string | null;
  worstTradeCNS: string | null;
  averageHoldingTimeSeconds: number | null;
  longestWinningStreak: number;
  longestLosingStreak: number;
  maxRealizedDrawdownCNS: string;
};

type AnalyticsResponse = {
  status: "ok";
  accountId: string;
  indexedLifecycleEvents: number;
  analytics: HistoricalAnalytics;
  trades: HistoricalTrade[];
};

type SyncingResponse = {
  status: "syncing";
  accountId: string;
  completedCategories: number;
  totalCategories: number;
  totalHashes: number;
  checkedHashes: number;
};

type ErrorResponse = {
  status: string;
  error?: string;
};

function ausdFromCNS(value: string | null): number | null {
  if (value === null) return null;

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;

  return parsed / 1_000_000;
}

function moneyFromCNS(value: string | null): string {
  const amount = ausdFromCNS(value);

  if (amount === null) return "—";

  const abs = Math.abs(amount);
  const digits = abs > 0 && abs < 0.01 ? 6 : 2;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount);
}

function percent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function ratio(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toFixed(2);
}

function duration(value: number | string | null): string {
  if (value === null) return "—";

  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return "—";

  if (seconds < 60) return `${Math.round(seconds)}s`;

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);

  if (minutes < 60) {
    return remainingSeconds > 0
      ? `${minutes}m ${remainingSeconds}s`
      : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes > 0
    ? `${hours}h ${remainingMinutes}m`
    : `${hours}h`;
}

function timestamp(value: string): string {
  const seconds = Number(value);

  if (!Number.isFinite(seconds)) return "—";

  return new Date(seconds * 1000).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sideLabel(side: HistoricalTrade["side"]): string {
  return side === 0 ? "LONG" : "SHORT";
}

export default function HistoricalTraderAnalytics({
  accountId,
}: {
  accountId: number | null;
}) {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [syncing, setSyncing] = useState<SyncingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState("");

  const accountRef = useRef(accountId);

  // Update synchronously so responses from an old account are ignored.
  accountRef.current = accountId;

  useEffect(() => {
    if (accountId === null) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();

    const isCurrent = () =>
      !cancelled && accountRef.current === accountId;

    async function runCycle(initial: boolean) {
      if (!isCurrent()) return;

      if (initial) {
        setLoading(true);
        setData(null);
        setSyncing(null);
        setUnavailable(false);
        setError("");
      }

      let shouldRetry = false;

      try {
        const response = await fetch(
          `/api/perpl/analytics?accountId=${encodeURIComponent(
            String(accountId),
          )}`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );

        const result = (await response.json()) as
          | AnalyticsResponse
          | SyncingResponse
          | ErrorResponse;

        if (!isCurrent()) return;

        if (response.ok && result.status === "syncing") {
          setData(null);
          setSyncing(result as SyncingResponse);
          setUnavailable(false);
          setError("");
          shouldRetry = true;

          // One batch per cycle. Server enforces throttle and lease.
          const syncResponse = await fetch(
            "/api/perpl/sync-request",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                accountId: String(accountId),
              }),
              cache: "no-store",
              signal: AbortSignal.any([
                controller.signal,
                AbortSignal.timeout(45000),
              ]),
            },
          );

          if (!isCurrent()) return;

          if (
            !syncResponse.ok &&
            syncResponse.status !== 429
          ) {
            throw new Error(
              `Historical sync failed: HTTP ${syncResponse.status}`,
            );
          }

          return;
        }

        if (
          response.status === 503 ||
          result.status === "unavailable"
        ) {
          setData(null);
          setSyncing(null);
          setUnavailable(true);
          setError("");
          return;
        }

        if (
          !response.ok ||
          result.status !== "ok" ||
          !("analytics" in result)
        ) {
          throw new Error(
            "error" in result && result.error
              ? result.error
              : `HTTP ${response.status}`,
          );
        }

        setData(result);
        setSyncing(null);
        setUnavailable(false);
        setError("");
      } catch (err) {
        if (!isCurrent()) return;

        console.error(
          "Historical analytics synchronization failed:",
          err,
        );

        setError(
          "Synchronization temporarily interrupted. Retrying..."
        );

        // Retry temporary errors without overlapping requests.
        shouldRetry = true;
      } finally {
        if (isCurrent()) {
          setLoading(false);

          if (shouldRetry) {
            timer = setTimeout(() => {
              void runCycle(false);
            }, 5000);
          }
        }
      }
    }

    timer = setTimeout(() => {
      void runCycle(true);
    }, 0);

    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [accountId]);

  if (accountId === null) return null;

  const analytics = data?.analytics;

  return (
    <div className="border-t border-white/10">
      <div className="flex flex-col gap-2 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium">Historical Performance</h3>

            {data ? (
              <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-cyan-300">
                Indexed
              </span>
            ) : null}
          </div>

          <p className="mt-1 text-xs text-zinc-600">
            Realized trading performance reconstructed from indexed Perpl
            lifecycle events.
          </p>
        </div>

        <span className="text-xs text-zinc-600">
          {data
            ? `${data.indexedLifecycleEvents.toLocaleString("en-US")} lifecycle events`
            : loading
              ? "Loading history..."
              : "Historical index"}
        </span>
      </div>

      {syncing ? (
        <div className="border-t border-white/10 px-6 py-8">
          <p className="text-sm font-medium text-cyan-300">
            Historical data synchronization
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            {syncing.completedCategories} of {syncing.totalCategories}
            {" "}event categories complete.
            {" "}{syncing.checkedHashes} of {syncing.totalHashes}
            {" "}transaction hashes checked.
          </p>
          <p className="mt-2 text-xs text-zinc-600">
            Performance metrics remain hidden until synchronization
            is complete.
          </p>
        </div>
      ) : loading ? (
        <div className="border-t border-white/10 px-6 py-10 text-center text-sm text-zinc-600">
          Reconstructing indexed Perpl history...
        </div>
      ) : unavailable ? (
        <div className="border-t border-white/10 px-6 py-8">
          <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.04] px-5 py-5">
            <p className="text-sm font-medium text-amber-300">
              Historical index unavailable
            </p>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-zinc-500">
              Live Monad account and position data above remain available.
              Historical metrics are intentionally hidden until the Perpl event
              index is reachable. No historical values are estimated or mocked.
            </p>
          </div>
        </div>
      ) : error ? (
        <div className="border-t border-white/10 px-6 py-8">
          <div className="rounded-xl border border-red-400/15 bg-red-400/[0.04] px-5 py-5">
            <p className="text-sm font-medium text-red-300">
              Historical analytics error
            </p>
            <p className="mt-2 text-xs leading-5 text-zinc-500">{error}</p>
          </div>
        </div>
      ) : analytics && data ? (
        <>
          <div className="grid gap-px border-y border-white/10 bg-white/10 sm:grid-cols-2 xl:grid-cols-4">
            <HistoricalMetric
              label="Net Realized PnL"
              value={moneyFromCNS(analytics.totalNetPnlCNS)}
              sub={`${analytics.totalTrades} completed trades`}
              tone={
                Number(analytics.totalNetPnlCNS) > 0
                  ? "positive"
                  : Number(analytics.totalNetPnlCNS) < 0
                    ? "negative"
                    : "neutral"
              }
            />

            <HistoricalMetric
              label="Win Rate"
              value={percent(analytics.winRate)}
              sub={`${analytics.wins}W · ${analytics.losses}L · ${analytics.breakeven} BE`}
            />

            <HistoricalMetric
              label="Profit Factor"
              value={ratio(analytics.profitFactor)}
              sub="Gross profit ÷ gross loss"
            />

            <HistoricalMetric
              label="Max Realized Drawdown"
              value={moneyFromCNS(analytics.maxRealizedDrawdownCNS)}
              sub="Realized trade equity curve"
              tone="negative"
            />

            <HistoricalMetric
              label="Average Hold"
              value={duration(analytics.averageHoldingTimeSeconds)}
              sub="Completed lifecycle duration"
            />

            <HistoricalMetric
              label="Best Trade"
              value={moneyFromCNS(analytics.bestTradeCNS)}
              sub="Net realized PnL"
              tone="positive"
            />

            <HistoricalMetric
              label="Worst Trade"
              value={moneyFromCNS(analytics.worstTradeCNS)}
              sub="Net realized PnL"
              tone="negative"
            />

            <HistoricalMetric
              label="Longest Streak"
              value={`${analytics.longestWinningStreak}W / ${analytics.longestLosingStreak}L`}
              sub="Consecutive realized outcomes"
            />
          </div>

          <div>
            <div className="flex flex-col gap-2 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-medium">Completed Trades</h3>
                <p className="mt-1 text-xs text-zinc-600">
                  Reconstructed lifecycle with attributed taker fees.
                </p>
              </div>

              <span className="text-xs text-zinc-600">
                {data.trades.length} reconstructed
              </span>
            </div>

            {data.trades.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-left">
                  <thead className="border-y border-white/10 text-[10px] uppercase tracking-wider text-zinc-600">
                    <tr>
                      <th className="px-6 py-3 font-medium">Market</th>
                      <th className="px-4 py-3 font-medium">Side</th>
                      <th className="px-4 py-3 font-medium">Opened</th>
                      <th className="px-4 py-3 font-medium">Closed</th>
                      <th className="px-4 py-3 font-medium">Hold</th>
                      <th className="px-4 py-3 font-medium">Gross PnL</th>
                      <th className="px-4 py-3 font-medium">Funding</th>
                      <th className="px-4 py-3 font-medium">Fees</th>
                      <th className="px-4 py-3 font-medium">Net PnL</th>
                      <th className="px-6 py-3 font-medium">Exit</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-white/[0.06]">
                    {data.trades.map((trade, index) => (
                      <tr
                        key={`${trade.perpId}-${trade.openedAt}-${trade.closedAt}-${index}`}
                      >
                        <td className="px-6 py-4 font-mono text-sm text-zinc-300">
                          Perp #{trade.perpId}
                        </td>

                        <td className="px-4 py-4">
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-medium ${
                              trade.side === 0
                                ? "bg-emerald-400/10 text-emerald-300"
                                : "bg-red-400/10 text-red-300"
                            }`}
                          >
                            {sideLabel(trade.side)}
                          </span>
                        </td>

                        <td className="px-4 py-4 text-xs text-zinc-400">
                          {timestamp(trade.openedAt)}
                        </td>

                        <td className="px-4 py-4 text-xs text-zinc-400">
                          {timestamp(trade.closedAt)}
                        </td>

                        <td className="px-4 py-4 font-mono text-sm text-zinc-300">
                          {duration(trade.holdingTimeSeconds)}
                        </td>

                        <td className="px-4 py-4 font-mono text-sm text-zinc-300">
                          {moneyFromCNS(trade.grossPnlCNS)}
                        </td>

                        <td className="px-4 py-4 font-mono text-sm text-zinc-400">
                          {moneyFromCNS(trade.fundingCNS)}
                        </td>

                        <td className="px-4 py-4 font-mono text-sm text-zinc-400">
                          {moneyFromCNS(trade.takerFeesCNS)}
                        </td>

                        <td
                          className={`px-4 py-4 font-mono text-sm font-medium ${
                            trade.outcome === "win"
                              ? "text-emerald-400"
                              : trade.outcome === "loss"
                                ? "text-red-400"
                                : "text-zinc-300"
                          }`}
                        >
                          {moneyFromCNS(trade.netPnlCNS)}
                        </td>

                        <td className="px-6 py-4 text-xs uppercase tracking-wider text-zinc-500">
                          {trade.finalReason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="border-t border-white/10 px-6 py-8 text-center">
                <p className="text-sm text-zinc-400">
                  No completed trades indexed.
                </p>
                <p className="mt-2 text-xs text-zinc-600">
                  No complete position lifecycle was found for this account.
                </p>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

function HistoricalMetric({
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
      <p className={`mt-3 text-xl font-semibold ${valueClass}`}>{value}</p>
      <p className="mt-2 text-xs text-zinc-600">{sub}</p>
    </div>
  );
}
