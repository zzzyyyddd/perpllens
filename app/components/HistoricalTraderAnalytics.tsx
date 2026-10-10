"use client";

import PerplRecentTrades from "./PerplRecentTrades";

export default function HistoricalTraderAnalytics({
  accountId,
}: {
  accountId: number | null;
}) {
  if (accountId === null) return null;

  return (
    <div className="border-t border-white/10">
      <div className="px-6 py-5">
        <h3 className="text-sm font-medium">
          Verified Recent Trades
        </h3>

        <p className="mt-1 text-xs text-zinc-500">
          Recent completed trades reconstructed from indexed
          Perpl events. This is a verified sample, not a
          complete trading history.
        </p>
      </div>

      <PerplRecentTrades accountId={String(accountId)} />
    </div>
  );
}
