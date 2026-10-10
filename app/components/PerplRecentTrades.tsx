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

export default function PerplRecentTrades({
  accountId,
}: {
  accountId: string;
}) {
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    setData(null);
    setError("");

    fetch(
      `/api/perpl/recent-trades?accountId=${encodeURIComponent(accountId)}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(setData)
      .catch((err) => {
        if (!controller.signal.aborted) setError(String(err));
      });

    return () => controller.abort();
  }, [accountId]);

  return (
    <section className="border-t border-white/10 px-6 py-5">
      <h3 className="text-sm font-semibold">Verified Recent Trades</h3>
      <p className="mt-1 text-xs text-amber-300">
        Recent sample only — not full wallet history
      </p>

      {!data && !error && (
        <p className="mt-4 text-sm text-zinc-500">
          Verifying recent trades...
        </p>
      )}

      {error && (
        <p className="mt-4 text-sm text-red-400">
          Verification unavailable: {error}
        </p>
      )}

      {data?.status === "ok" && (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-zinc-500">
            {data.trades?.length ?? 0} reconstructed trades
            from {data.candidateCount ?? 0} candidates
          </p>

          {data.trades?.map((trade, index) => (
            <div
              key={index}
              className="flex items-center justify-between border border-white/10 p-3"
            >
              <div>
                <p className="text-sm">Perp #{trade.perpId}</p>
                <p className="text-xs text-zinc-500">
                  {trade.holdingTimeSeconds}s · {trade.outcome}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium">
                  {trade.netPnlCNS} CNS
                </p>
                <p className="text-xs text-zinc-500">
                  Fees: {trade.takerFeesCNS} CNS
                </p>
              </div>
            </div>
          ))}

          {data.trades?.length === 0 && (
            <p className="text-sm text-zinc-500">
              No recent trades verified in this sample.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
