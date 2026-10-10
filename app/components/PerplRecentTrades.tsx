"use client";

import { useEffect, useState } from "react";
import TraderPerformance from "./TraderPerformance";

type Trade = {
  perpId: string;
  closedAt: string;
  netPnlCNS: string;
  takerFeesCNS: string;
  holdingTimeSeconds: string;
  outcome: string;
};

type Result = {
  status: string;
  scope?: string;
  candidateCount?: number;
  analytics?: {
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number | null;
    profitFactor: number | null;
    totalNetPnlCNS: string;
  };
  trades?: Trade[];
};

type LoadState = "loading" | "success" | "unavailable";

function formatCNS(value: string): string {
  const raw = BigInt(value);
  const negative = raw < BigInt(0);
  const absolute = negative ? -raw : raw;

  const whole = absolute / BigInt(1000000);
  const fraction = (absolute % BigInt(1000000))
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "");

  return `${negative ? "-" : ""}${whole.toLocaleString("en-US")}${
    fraction ? "." + fraction : ""
  }`;
}

export default function PerplRecentTrades({
  accountId,
}: {
  accountId: string;
}) {
  const [data, setData] = useState<Result | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setData(null);
    setState("loading");

    const timeout = setTimeout(() => {
      controller.abort();
      if (active) setState("unavailable");
    }, 30000);

    async function load() {
      try {
        const response = await fetch(
          `/api/perpl/recent-trades?accountId=${encodeURIComponent(accountId)}`,
          {
            signal: controller.signal,
            cache: "no-store",
          },
        );

        if (!response.ok) {
          throw new Error("Verification request failed");
        }

        const result: Result = await response.json();

        if (result.status !== "ok" || !Array.isArray(result.trades)) {
          throw new Error("Incomplete verification response");
        }

        if (active && !controller.signal.aborted) {
          setData(result);
          setState("success");
        }
      } catch {
        if (active) setState("unavailable");
      } finally {
        clearTimeout(timeout);
      }
    }

    void load();

    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [accountId, retryCount]);

  return (
    <section className="border-t border-white/10 px-6 py-5">
      <h3 className="text-sm font-semibold">
        Verified Recent Trades
      </h3>

      <p className="mt-1 text-xs text-amber-300">
        Verified recent sample only — not complete trading history.
      </p>

      {state === "loading" && (
        <div
          className="mt-4 flex items-start gap-3 rounded-xl border border-cyan-400/10 bg-cyan-400/[0.03] p-4"
          role="status"
          aria-live="polite"
        >
          <span
            className="mt-0.5 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-cyan-400/20 border-t-cyan-300"
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-medium text-zinc-200">
              Verifying onchain trade history...
            </p>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              Reconstructing completed positions and fees from
              Envio-indexed Monad events. Initial verification may
              take 10–30 seconds.
            </p>
          </div>
        </div>
      )}

      {state === "unavailable" && (
        <div className="mt-4 space-y-1" role="status">
          <p className="text-sm text-amber-300">
            Recent trade verification is temporarily unavailable.
          </p>
          <p className="text-xs text-zinc-500">
            Wallet and position data remain available.
            No trading history has been inferred.
          </p>
          <button
            type="button"
            onClick={() => setRetryCount((count) => count + 1)}
            className="mt-3 rounded-lg border border-white/20 px-4 py-2 text-sm text-white transition hover:bg-white/10"
          >
            Retry Verification
          </button>
        </div>
      )}

      {state === "success" && data && (
        <div className="mt-4 space-y-3">
          {data.analytics && data.trades && (
            <TraderPerformance
              analytics={data.analytics}
              trades={data.trades}
            />
          )}
          <p className="text-xs text-zinc-500">
            {data.trades?.length ?? 0} verified trades from{" "}
            {data.candidateCount ?? 0} recent candidates.
            This is not a lifetime trade count.
          </p>

          {data.trades?.map((trade, index) => (
            <div
              key={`${trade.perpId}-${index}`}
              className="flex items-center justify-between rounded-lg border border-white/10 p-3"
            >
              <div>
                <p className="text-sm">Perp #{trade.perpId}</p>
                <p className="text-xs text-zinc-500">
                  {trade.holdingTimeSeconds}s · {trade.outcome}
                </p>
              </div>

              <div className="text-right">
                <p className="text-sm font-medium">
                  {formatCNS(trade.netPnlCNS)} CNS
                </p>
                <p className="text-xs text-zinc-500">
                  Fees: {formatCNS(trade.takerFeesCNS)} CNS
                </p>
              </div>
            </div>
          ))}

          {data.trades?.length === 0 && (
            <p className="text-sm text-zinc-400">
              No completed trades could be verified in this
              recent sample. This does not mean the wallet
              has never traded.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
