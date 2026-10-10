"use client";

import { useEffect, useState } from "react";

type Trade = {
  perpId: string;
  netPnlCNS: string;
  takerFeesCNS: string;
  holdingTimeSeconds: string;
  outcome: string;
};

type Result = {
  status: string;
  scope?: string;
  candidateCount?: number;
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
        <p className="mt-4 text-sm text-zinc-400" role="status">
          Verifying recent trades. This may take a few seconds...
        </p>
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
