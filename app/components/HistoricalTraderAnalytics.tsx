"use client";

import PerplRecentTrades from "./PerplRecentTrades";

export default function HistoricalTraderAnalytics({
  accountId,
}: {
  accountId: number | null;
}) {
  if (accountId === null) return null;

  return <PerplRecentTrades accountId={String(accountId)} />;
}
