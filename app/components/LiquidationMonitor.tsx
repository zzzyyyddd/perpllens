
"use client";

import { useEffect, useState } from "react";

type LiquidationEvent = {
  id: string;
  accountId: string;
  perpId: string;
  positionType: number;
  timestamp: string;
  transactionHash: string;
};

type LiquidationResponse = {
  status: "ok";
  totalLiquidations: number;
  byMarket: Record<string, number>;
  recent: LiquidationEvent[];
  updatedAt: string;
};

type Market = {
  id: number;
  name: string;
};

export default function LiquidationMonitor({
  selectedMarketId,
  markets,
}: {
  selectedMarketId: number;
  markets: Market[];
}) {
  const [data, setData] = useState<LiquidationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await fetch("/api/perpl/liquidations", {
          cache: "no-store",
        });

        if (!response.ok) throw new Error("API unavailable");

        const result = (await response.json()) as LiquidationResponse;

        if (result.status !== "ok") {
          throw new Error("Invalid API status");
        }

        if (!active) return;

        setData(result);
        setError(false);
      } catch {
        if (!active) return;

        setError(true);
        setData(null);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    const interval = setInterval(() => void load(), 30_000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const marketName =
    markets.find((market) => market.id === selectedMarketId)?.name ??
    `Market ${selectedMarketId}`;

  const selectedCount = data?.byMarket[String(selectedMarketId)] ?? 0;

  const recentForMarket = data?.recent.filter(
    (event) => Number(event.perpId) === selectedMarketId,
  ) ?? [];

  return (
    <section className="mt-8 rounded-2xl border border-white/10 bg-[#0d1014] p-5 sm:p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-white">
          Liquidation Monitor
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Onchain liquidation events · Envio HyperIndex · Rolling 24h
        </p>
      </div>

      {loading && !data ? (
        <p className="text-sm text-zinc-400">
          Loading liquidation events...
        </p>
      ) : error || !data ? (
        <p className="text-sm text-amber-300">
          Liquidation data temporarily unavailable.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
              <p className="text-sm text-zinc-500">
                Protocol liquidations · 24h
              </p>
              <p className="mt-2 text-3xl font-semibold text-white">
                {data.totalLiquidations.toLocaleString()}
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
              <p className="text-sm text-zinc-500">
                {marketName} liquidations · 24h
              </p>
              <p className="mt-2 text-3xl font-semibold text-white">
                {selectedCount.toLocaleString()}
              </p>
            </div>
          </div>

          <div className="mt-6">
            <h3 className="mb-3 text-sm font-semibold text-white">
              Recent {marketName} liquidations
            </h3>

            {recentForMarket.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No matching events in the latest protocol-wide sample.
              </p>
            ) : (
              <div className="space-y-2">
                {recentForMarket.map((event) => (
                  <a
                    key={event.id}
                    href={`https://monadvision.com/tx/${event.transactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 p-3 transition hover:border-white/20"
                  >
                    <span className="font-mono text-xs text-zinc-300">
                      {event.transactionHash.slice(0, 10)}…
                      {event.transactionHash.slice(-6)}
                    </span>

                    <span className="text-xs text-zinc-500">
                      {new Date(Number(event.timestamp) * 1000)
                        .toLocaleString()}
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>

          <p className="mt-5 text-xs text-zinc-600">
            Event counts, not USD liquidation volume. Data reflects
            indexed onchain events and may lag the latest block.
          </p>
        </>
      )}
    </section>
  );
}
