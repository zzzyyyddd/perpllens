"use client";

import { useEffect, useMemo, useState } from "react";
import MarketChart from "./components/MarketChart";
import RiskPanel from "./components/RiskPanel";
import TraderIntelligence from "./components/TraderIntelligence";

type Market = {
  id: number;
  name: string;
  symbol: string;
  size_units: string;
  config: {
    is_open: boolean;
    price_decimals: number;
    size_decimals: number;
  };
  state: {
    mrk: number;
    lst: number;
    mid: number;
    bid: number;
    ask: number;
    prv: number;
    dv: number;
    dva: string;
    oi: number;
    tvl: string;
  };
  funding: {
    rate: number;
    div: number;
  };
};

type Candle = {
  t: number;
  o: number;
  c: number;
  h: number;
  l: number;
  v: string;
  n: number;
};

type PerplResponse = {
  chain: {
    chain_id: number;
    name: string;
  };
  tokens: {
    symbol: string;
    decimals: number;
  }[];
  markets: Market[];
  updatedAt: string;
};

function formatUSD(value: number) {
  if (!Number.isFinite(value)) return "—";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: value >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number) {
  if (!Number.isFinite(value)) return "—";

  return new Intl.NumberFormat("en-US", {
    notation: value >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: 2,
  }).format(value);
}

function getPrice(market: Market) {
  return market.state.mrk / 10 ** market.config.price_decimals;
}

function getPreviousPrice(market: Market) {
  return market.state.prv / 10 ** market.config.price_decimals;
}

function getChange(market: Market) {
  const current = getPrice(market);
  const previous = getPreviousPrice(market);

  if (!previous) return 0;

  return ((current - previous) / previous) * 100;
}

function getDailyVolumeUSD(market: Market) {
  return Number(market.state.dva) / 1_000_000;
}

function getTVLUSD(market: Market) {
  return Number(market.state.tvl) / 1_000_000;
}

function getOpenInterestUnits(market: Market) {
  return market.state.oi / 10 ** market.config.size_decimals;
}

function getOpenInterestUSD(market: Market) {
  return getOpenInterestUnits(market) * getPrice(market);
}

function getFundingRate(market: Market) {
  if (!market.funding) return 0;

  // Perpl funding.rate is expressed in micros (10^-6 fraction).
  // Convert the fraction to percentage: rate / 1,000,000 * 100.
  return market.funding.rate / 10_000;
}

export default function Home() {
  const [selectedMarketId, setSelectedMarketId] = useState(1);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [candlesLoading, setCandlesLoading] = useState(false);

  const [data, setData] = useState<PerplResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadMarkets() {
    try {
      const response = await fetch("/api/perpl/markets", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      setData(result);
      setError("");
    } catch (err) {
      console.error(err);
      setError("Unable to load live Perpl market data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMarkets();

    const interval = setInterval(loadMarkets, 30_000);

    return () => clearInterval(interval);
  }, []);

  const totals = useMemo(() => {
    if (!data) {
      return {
        volume: 0,
        openInterest: 0,
        tvl: 0,
        markets: 0,
      };
    }

    return {
      volume: data.markets.reduce(
        (sum, market) => sum + getDailyVolumeUSD(market),
        0
      ),
      openInterest: data.markets.reduce(
        (sum, market) => sum + getOpenInterestUSD(market),
        0
      ),
      tvl: data.markets.reduce(
        (sum, market) => sum + getTVLUSD(market),
        0
      ),
      markets: data.markets.filter((market) => market.config.is_open).length,
    };
  }, [data]);

  useEffect(() => {
    let cancelled = false;

    async function loadCandles() {
      setCandlesLoading(true);

      try {
        const response = await fetch(
          `/api/perpl/candles?marketId=${selectedMarketId}`,
          { cache: "no-store" }
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();

        if (!cancelled) {
          setCandles(result.candles ?? []);
        }
      } catch (error) {
        console.error("Failed to load candles:", error);

        if (!cancelled) {
          setCandles([]);
        }
      } finally {
        if (!cancelled) {
          setCandlesLoading(false);
        }
      }
    }

    loadCandles();

    return () => {
      cancelled = true;
    };
  }, [selectedMarketId]);

  return (
    <main className="min-h-screen bg-[#07090d] text-white">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <header className="mb-10 flex flex-col gap-5 border-b border-white/10 pb-7 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-lg font-black text-black">
                P
              </div>

              <h1 className="text-2xl font-semibold tracking-tight">
                PerplLens
              </h1>

              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
                LIVE
              </span>
            </div>

            <p className="text-sm text-zinc-400">
              Real-time trading intelligence & risk analytics for Perpl.
            </p>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5">
              <span className="text-zinc-500">Network </span>
              <span className="font-medium text-zinc-200">
                {data?.chain?.name ?? "Monad"} · {data?.chain?.chain_id ?? 143}
              </span>
            </div>

            <button
              onClick={loadMarkets}
              className="rounded-xl border border-white/10 bg-white px-4 py-2.5 font-medium text-black transition hover:bg-zinc-200"
            >
              Refresh
            </button>
          </div>
        </header>

        <section className="mb-10">
          <div className="mb-4">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
              Protocol Overview
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="24H Volume"
              value={loading ? "Loading..." : formatUSD(totals.volume)}
              sub="Across all Perpl markets"
            />

            <StatCard
              label="Open Interest"
              value={loading ? "Loading..." : formatUSD(totals.openInterest)}
              sub="Estimated notional value"
            />

            <StatCard
              label="Market TVL"
              value={loading ? "Loading..." : formatUSD(totals.tvl)}
              sub="Across active markets"
            />

            <StatCard
              label="Active Markets"
              value={loading ? "..." : String(totals.markets)}
              sub="Live perpetual markets"
            />
          </div>
        </section>

        <TraderIntelligence />

        <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
          <div className="flex flex-col gap-2 border-b border-white/10 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold">Live Markets</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Market state fetched directly from Perpl.
              </p>
            </div>

            {data?.updatedAt && (
              <p className="text-xs text-zinc-500">
                Updated{" "}
                {new Date(data.updatedAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </p>
            )}
          </div>

          {error ? (
            <div className="p-10 text-center text-sm text-red-400">
              {error}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[950px] text-left">
                <thead className="border-b border-white/10 text-xs uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="px-6 py-4 font-medium">Market</th>
                    <th className="px-4 py-4 font-medium">Mark Price</th>
                    <th className="px-4 py-4 font-medium">24H</th>
                    <th className="px-4 py-4 font-medium">24H Volume</th>
                    <th className="px-4 py-4 font-medium">Open Interest</th>
                    <th className="px-4 py-4 font-medium">TVL</th>
                    <th className="px-4 py-4 font-medium">Funding</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-white/[0.06]">
                  {data?.markets.map((market) => {
                    const change = getChange(market);
                    const positive = change >= 0;

                    return (
                      <tr
                        key={market.id}
                        onClick={() => setSelectedMarketId(market.id)}
                        className={`cursor-pointer transition ${
                          selectedMarketId === market.id
                            ? "bg-emerald-500/[0.07]"
                            : "hover:bg-white/[0.035]"
                        }`}
                      >
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-xs font-bold">
                              {market.name.slice(0, 2)}
                            </div>

                            <div>
                              <p className="font-medium">{market.name}</p>
                              <p className="text-xs text-zinc-500">
                                {market.name}-PERP
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-5 font-mono text-sm">
                          {formatUSD(getPrice(market))}
                        </td>

                        <td
                          className={`px-4 py-5 font-mono text-sm ${
                            positive ? "text-emerald-400" : "text-red-400"
                          }`}
                        >
                          {positive ? "+" : ""}
                          {change.toFixed(2)}%
                        </td>

                        <td className="px-4 py-5 font-mono text-sm text-zinc-300">
                          {formatUSD(getDailyVolumeUSD(market))}
                        </td>

                        <td className="px-4 py-5 font-mono text-sm text-zinc-300">
                          {formatUSD(getOpenInterestUSD(market))}
                        </td>

                        <td className="px-4 py-5 font-mono text-sm text-zinc-300">
                          {formatUSD(getTVLUSD(market))}
                        </td>

                        <td className="px-4 py-5 font-mono text-sm text-zinc-300">
                          {getFundingRate(market).toFixed(4)}%
                        </td>

                        <td className="px-6 py-5">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                              market.config.is_open
                                ? "bg-emerald-400/10 text-emerald-300"
                                : "bg-red-400/10 text-red-300"
                            }`}
                          >
                            {market.config.is_open ? "OPEN" : "CLOSED"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="mx-auto w-full max-w-7xl px-6">
        {candlesLoading && candles.length === 0 ? (
          <div className="mt-8 flex h-[300px] items-center justify-center rounded-2xl border border-white/10 bg-[#0d1014] text-sm text-slate-500">
            Loading market analytics...
          </div>
        ) : (
          <>
            <MarketChart
              marketName={
                data?.markets.find((market) => market.id === selectedMarketId)?.name ??
                "Market"
              }
              priceDecimals={
                data?.markets.find((market) => market.id === selectedMarketId)
                  ?.config.price_decimals ?? 0
              }
              candles={candles}
            />

            {data?.markets.find(
              (market) => market.id === selectedMarketId
            ) && (
              <RiskPanel
                market={
                  data.markets.find(
                    (market) => market.id === selectedMarketId
                  )!
                }
                markets={data.markets}
                candles={candles}
              />
            )}
          </>
        )}
      </div>

      <footer className="mt-6 flex flex-col gap-2 text-xs text-zinc-600 sm:flex-row sm:justify-between">
          <span>PerplLens · Monad Mainnet</span>
          <span>Live data · Auto-refresh 10s</span>
        </footer>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-2 text-xs text-zinc-600">{sub}</p>
    </div>
  );
}
