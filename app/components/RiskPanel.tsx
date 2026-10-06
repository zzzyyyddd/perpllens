"use client";

type Market = {
  id: number;
  name: string;
  config: {
    price_decimals: number;
    size_decimals: number;
  };
  state: {
    mrk: number;
    prv: number;
    oi: number;
    tvl: string;
  };
  funding: {
    rate: number;
  };
  analytics?: {
    volatility24h: number | null;
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

type Props = {
  market: Market;
  markets: Market[];
  candles: Candle[];
};

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

function price(market: Market) {
  return market.state.mrk / 10 ** market.config.price_decimals;
}

function change24h(market: Market) {
  const current = price(market);
  const previous =
    market.state.prv / 10 ** market.config.price_decimals;

  if (!previous) return 0;

  return Math.abs(((current - previous) / previous) * 100);
}

function oiTvl(market: Market) {
  const oiUnits =
    market.state.oi / 10 ** market.config.size_decimals;

  const oiUsd = oiUnits * price(market);
  const tvl = Number(market.state.tvl) / 1_000_000;

  return tvl ? oiUsd / tvl : 0;
}

function funding(market: Market) {
  return Math.abs(market.funding?.rate ?? 0) / 10_000;
}

function volatility(candles: Candle[], decimals: number) {
  if (!candles.length) return 0;

  const divisor = 10 ** decimals;
  const open = candles[0].o / divisor;

  if (!open) return 0;

  const high =
    Math.max(...candles.map((c) => c.h)) / divisor;

  const low =
    Math.min(...candles.map((c) => c.l)) / divisor;

  return ((high - low) / open) * 100;
}

export default function RiskPanel({
  market,
  markets,
  candles,
}: Props) {
  /*
    Market Risk Score v1

    30% leverage pressure
    30% intraday volatility
    25% price shock
    15% funding pressure

    Components are scaled relative to live observed Perpl market
    conditions rather than representing liquidation probability.
  */

  const leverageValue = oiTvl(market);
  const volatilityValue =
    market.analytics?.volatility24h ??
    volatility(candles, market.config.price_decimals);
  const shockValue = change24h(market);
  const fundingValue = funding(market);

  const maxLeverage = Math.max(
    ...markets.map(oiTvl),
    1
  );

  const maxShock = Math.max(
    ...markets.map(change24h),
    1
  );

  const maxFunding = Math.max(
    ...markets.map(funding),
    0.0001
  );

  const liveVolatilities = markets
    .map((item) => item.analytics?.volatility24h)
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value)
    );

  const maxVolatility = Math.max(
    ...liveVolatilities,
    volatilityValue,
    0.0001
  );

  const leverageScore = clamp(
    (leverageValue / maxLeverage) * 100
  );

  const volatilityScore = clamp(
    (volatilityValue / maxVolatility) * 100
  );

  const shockScore = clamp(
    (shockValue / maxShock) * 100
  );

  const fundingScore = clamp(
    (fundingValue / maxFunding) * 100
  );

  const score = Math.round(
    leverageScore * 0.30 +
      volatilityScore * 0.30 +
      shockScore * 0.25 +
      fundingScore * 0.15
  );

  const level =
    score >= 75
      ? "EXTREME"
      : score >= 55
        ? "HIGH"
        : score >= 30
          ? "MODERATE"
          : "LOW";

  const reasons = [
    {
      name: "Leverage Pressure",
      score: leverageScore,
      detail: `${leverageValue.toFixed(2)}x OI / TVL`,
      weight: "30%",
    },
    {
      name: "24H Volatility",
      score: volatilityScore,
      detail: `${volatilityValue.toFixed(2)}% high-low range`,
      weight: "30%",
    },
    {
      name: "Price Shock",
      score: shockScore,
      detail: `${shockValue.toFixed(2)}% absolute move`,
      weight: "25%",
    },
    {
      name: "Funding Pressure",
      score: fundingScore,
      detail: `${fundingValue.toFixed(4)}% funding`,
      weight: "15%",
    },
  ];

  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-[#0d1014] p-6">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
            Market Risk Intelligence
          </p>

          <h2 className="mt-2 text-xl font-semibold text-white">
            {market.name} Risk Score
          </h2>

          <p className="mt-2 max-w-xl text-sm text-zinc-500">
            Relative market-risk indicator derived from live Perpl
            leverage, volatility, price movement and funding data.
          </p>
        </div>

        <div className="text-right">
          <div className="font-mono text-5xl font-semibold text-white">
            {score}
            <span className="text-xl text-zinc-600">/100</span>
          </div>

          <div className="mt-2 text-sm font-semibold tracking-widest text-emerald-400">
            {level}
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {reasons.map((item) => (
          <div
            key={item.name}
            className="rounded-xl border border-white/[0.07] bg-black/20 p-4"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-zinc-300">
                {item.name}
              </p>

              <span className="text-xs text-zinc-600">
                {item.weight}
              </span>
            </div>

            <p className="mt-2 text-xs text-zinc-500">
              {item.detail}
            </p>

            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-emerald-400"
                style={{
                  width: `${Math.max(2, item.score)}%`,
                }}
              />
            </div>

            <p className="mt-2 text-right font-mono text-xs text-zinc-500">
              {Math.round(item.score)}/100
            </p>
          </div>
        ))}
      </div>

      <p className="mt-5 text-xs text-zinc-600">
        Risk Score is a relative analytics indicator, not a prediction
        of liquidation, loss or future price direction.
      </p>
    </section>
  );
}
