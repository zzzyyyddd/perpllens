"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Candle = {
  t: number;
  o: number;
  c: number;
  h: number;
  l: number;
  v: string;
  n: number;
};

type MarketChartProps = {
  marketName: string;
  priceDecimals: number;
  candles: Candle[];
};

function formatUSD(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

export default function MarketChart({
  marketName,
  priceDecimals,
  candles,
}: MarketChartProps) {
  const data = candles.map((candle) => ({
    time: new Date(candle.t).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    price: candle.c / 10 ** priceDecimals,
    high: candle.h / 10 ** priceDecimals,
    low: candle.l / 10 ** priceDecimals,
    volume: Number(candle.v) / 1_000_000,
    trades: candle.n,
  }));

  const high =
    data.length > 0 ? Math.max(...data.map((item) => item.high)) : 0;

  const low =
    data.length > 0 ? Math.min(...data.map((item) => item.low)) : 0;

  const trades = data.reduce((sum, item) => sum + item.trades, 0);

  return (
    <section className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-[#0d1014]">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-white">
            {marketName} Market Analytics
          </p>
          <p className="mt-1 text-xs text-slate-500">
            24H · 1 hour candles · Live Perpl data
          </p>
        </div>

        <div className="flex gap-6 text-right">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">
              24H High
            </p>
            <p className="mt-1 text-sm font-medium text-white">
              {formatUSD(high)}
            </p>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">
              24H Low
            </p>
            <p className="mt-1 text-sm font-medium text-white">
              {formatUSD(low)}
            </p>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">
              Trades
            </p>
            <p className="mt-1 text-sm font-medium text-white">
              {formatCompact(trades)}
            </p>
          </div>
        </div>
      </div>

      <div className="h-[320px] px-2 pt-6">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
          >
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.06)"
              vertical={false}
            />

            <XAxis
              dataKey="time"
              tick={{ fill: "#64748b", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />

            <YAxis
              domain={["auto", "auto"]}
              tickFormatter={(value) => formatCompact(Number(value))}
              tick={{ fill: "#64748b", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={70}
            />

            <Tooltip
              formatter={(value) => [
                formatUSD(Number(value)),
                "Price",
              ]}
              contentStyle={{
                background: "#11151a",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "10px",
              }}
              labelStyle={{ color: "#94a3b8" }}
            />

            <Area
              type="monotone"
              dataKey="price"
              stroke="#22c55e"
              strokeWidth={2}
              fill="url(#priceGradient)"
              dot={false}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="h-[150px] border-t border-white/5 px-2 py-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 0, right: 20, left: 10, bottom: 0 }}
          >
            <XAxis
              dataKey="time"
              hide
            />

            <YAxis
              tickFormatter={(value) => formatCompact(Number(value))}
              tick={{ fill: "#64748b", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={70}
            />

            <Tooltip
              formatter={(value) => [
                formatUSD(Number(value)),
                "Volume",
              ]}
              contentStyle={{
                background: "#11151a",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "10px",
              }}
            />

            <Bar
              dataKey="volume"
              fill="#334155"
              radius={[3, 3, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
