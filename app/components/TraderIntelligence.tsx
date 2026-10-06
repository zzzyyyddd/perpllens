"use client";

import { useCallback, useEffect, useState } from "react";

type AccountData = {
  account: {
    address: string | null;
    accountId: number | null;
    collateral: number;
    lockedCollateral: number;
    availableCollateral: number;
    totalDeposited: number;
    totalWithdrawn: number;
    realizedPnl: number;
    tradingFees: number;
    tradeCount: number;
  };
  activity: {
    openPositionCount: number;
    returnedFillCount: number;
  };
  positions: unknown[];
  fills: unknown[];
  updatedAt: string;
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function shortAddress(address: string | null) {
  if (!address) return "—";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function TraderIntelligence() {
  const [data, setData] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAccount = useCallback(async () => {
    try {
      const response = await fetch("/api/perpl/account", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = (await response.json()) as AccountData;

      setData(result);
      setError("");
    } catch (err) {
      console.error("Failed to load trader intelligence:", err);
      setError("Unable to load authenticated trader data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccount();

    const interval = setInterval(loadAccount, 15_000);

    return () => clearInterval(interval);
  }, [loadAccount]);

  const account = data?.account;

  return (
    <section className="mb-10 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
      <div className="flex flex-col gap-3 border-b border-white/10 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-semibold">Trader Intelligence</h2>

            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-emerald-300">
              Authenticated
            </span>
          </div>

          <p className="mt-1 text-sm text-zinc-500">
            Live Perpl account activity and collateral intelligence.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {account && (
            <div className="text-right text-xs">
              <p className="font-mono text-zinc-300">
                {shortAddress(account.address)}
              </p>
              <p className="mt-1 text-zinc-600">
                Account #{account.accountId ?? "—"}
              </p>
            </div>
          )}

          <button
            onClick={loadAccount}
            className="rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300 transition hover:bg-white/[0.05]"
          >
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="px-6 py-10 text-center text-sm text-red-400">
          {error}
        </div>
      ) : (
        <>
          <div className="grid gap-px bg-white/10 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Collateral"
              value={loading || !account ? "Loading..." : money(account.collateral)}
              sub="Perpl account balance"
            />

            <Metric
              label="Available"
              value={
                loading || !account
                  ? "Loading..."
                  : money(account.availableCollateral)
              }
              sub={
                account
                  ? `${money(account.lockedCollateral)} locked`
                  : "Available collateral"
              }
            />

            <Metric
              label="Realized PnL"
              value={
                loading || !account ? "Loading..." : money(account.realizedPnl)
              }
              sub={
                account
                  ? `${money(account.tradingFees)} trading fees`
                  : "Realized trading result"
              }
              tone={
                account && account.realizedPnl > 0
                  ? "positive"
                  : account && account.realizedPnl < 0
                    ? "negative"
                    : "neutral"
              }
            />

            <Metric
              label="Trading Activity"
              value={
                loading || !account
                  ? "Loading..."
                  : `${account.tradeCount} trades`
              }
              sub={
                data
                  ? `${data.activity.openPositionCount} open · ${data.activity.returnedFillCount} fills loaded`
                  : "Account activity"
              }
            />
          </div>

          <div className="flex flex-col gap-3 px-6 py-4 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Deposited{" "}
              <span className="font-mono text-zinc-300">
                {account ? money(account.totalDeposited) : "—"}
              </span>
              {" · "}
              Withdrawn{" "}
              <span className="font-mono text-zinc-300">
                {account ? money(account.totalWithdrawn) : "—"}
              </span>
            </span>

            <span>
              {data?.updatedAt
                ? `Updated ${new Date(data.updatedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}`
                : "Waiting for account data"}
            </span>
          </div>
        </>
      )}
    </section>
  );
}

function Metric({
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
      <p className={`mt-3 text-xl font-semibold ${valueClass}`}>
        {value}
      </p>
      <p className="mt-2 text-xs text-zinc-600">{sub}</p>
    </div>
  );
}
