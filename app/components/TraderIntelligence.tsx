"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import HistoricalTraderAnalytics from "./HistoricalTraderAnalytics";

const DEFAULT_WALLET =
  "0x65760dfA797B2d75A3f6E006CB0807f93E2D0dc3";

type ActivePosition = {
  perpetualId: number;
  name: string;
  symbol: string;
  side: "LONG" | "SHORT" | "UNKNOWN";
  size: number;
  collateral: number;
  entryPrice: number;
  markPrice: number;
  markPriceValid: boolean;
  pnl: number;
  deltaPnl: number;
  premiumPnl: number;
  entryBlock: number;
};

type WalletData = {
  status: "ok";
  source: "monad_mainnet";
  chainId: number;
  account: {
    accountId: number;
    address: string;
    balance: number;
    lockedBalance: number;
    availableBalance: number;
    frozen: number;
    activePerpetualIds: number[];
    activePositions: ActivePosition[];
  };
  updatedAt: string;
};

type ApiError = {
  status: string;
  message: string;
};

function preciseMoney(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";

  const abs = Math.abs(value);
  const digits = abs > 0 && abs < 0.01 ? 6 : 2;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function price(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";

  const abs = Math.abs(value);
  const digits = abs < 0.01 ? 6 : abs < 1 ? 4 : 2;

  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function shortAddress(address: string | null) {
  if (!address) return "—";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function TraderIntelligence() {
  const [input, setInput] = useState(DEFAULT_WALLET);
  const [wallet, setWallet] = useState(DEFAULT_WALLET);
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadWallet = useCallback(async (address: string) => {
    setLoading(true);

    try {
      const response = await fetch(
        `/api/perpl/wallet?address=${encodeURIComponent(address)}`,
        { cache: "no-store" }
      );

      const result = (await response.json()) as WalletData | ApiError;

      if (
        !response.ok ||
        result.status !== "ok" ||
        !("account" in result)
      ) {
        throw new Error(
          "message" in result ? result.message : `HTTP ${response.status}`
        );
      }

      setData(result);
      setError("");
    } catch (err) {
      console.error("Failed to load onchain trader intelligence:", err);
      setData(null);
      setError(
        err instanceof Error
          ? err.message
          : "Unable to read this Perpl account from Monad."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = setTimeout(() => {
      void loadWallet(wallet);
    }, 0);

    const interval = setInterval(() => {
      void loadWallet(wallet);
    }, 15_000);

    return () => {
      clearTimeout(initialLoad);
      clearInterval(interval);
    };
  }, [loadWallet, wallet]);

  function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const next = input.trim();

    if (!next) return;

    if (next === wallet) {
      loadWallet(next);
      return;
    }

    setWallet(next);
  }

  const account = data?.account;

  return (
    <section className="mb-10 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
      <div className="border-b border-white/10 px-6 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-semibold">Trader Intelligence</h2>

              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-emerald-300">
                Onchain Live
              </span>

              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                Monad 143
              </span>
            </div>

            <p className="mt-2 text-sm text-zinc-500">
              Search any Perpl wallet and inspect its live account and open
              positions directly from the Perpl Exchange contract on Monad.
            </p>
          </div>

          <form
            onSubmit={analyze}
            className="flex w-full max-w-2xl flex-col gap-2 sm:flex-row"
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              spellCheck={false}
              aria-label="Perpl wallet address"
              placeholder="0x wallet address"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 font-mono text-xs text-zinc-200 outline-none transition placeholder:text-zinc-700 focus:border-white/20"
            />

            <button
              type="submit"
              disabled={loading}
              className="rounded-lg border border-white/10 bg-white/[0.05] px-4 py-2.5 text-xs font-medium text-zinc-200 transition hover:bg-white/[0.08] disabled:cursor-wait disabled:opacity-50"
            >
              {loading ? "Reading..." : "Analyze"}
            </button>
          </form>
        </div>
      </div>

      {error ? (
        <div className="px-6 py-10">
          <div className="mx-auto max-w-2xl rounded-xl border border-red-400/15 bg-red-400/[0.04] px-5 py-5">
            <p className="text-sm font-medium text-red-300">
              Wallet lookup unavailable
            </p>
            <p className="mt-2 text-sm leading-6 text-zinc-500">{error}</p>
            <p className="mt-3 text-xs text-zinc-600">
              Enter an EVM address with a Perpl account on Monad.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 border-b border-white/10 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-mono text-sm text-zinc-200">
                {account ? shortAddress(account.address) : "Reading wallet..."}
              </p>
              <p className="mt-1 text-xs text-zinc-600">
                {account
                  ? `Perpl Account #${account.accountId}`
                  : "Resolving Perpl account"}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-zinc-500">
              <span>Perpl Exchange</span>
              <span className="text-zinc-700">•</span>
              <span>Monad Mainnet</span>
              <span className="text-zinc-700">•</span>
              <span className="text-emerald-400">Contract Read</span>
            </div>
          </div>

          <div className="grid gap-px bg-white/10 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Balance"
              value={
                loading || !account
                  ? "Loading..."
                  : preciseMoney(account.balance)
              }
              sub="Perpl collateral balance"
            />

            <Metric
              label="Available"
              value={
                loading || !account
                  ? "Loading..."
                  : preciseMoney(account.availableBalance)
              }
              sub="Available collateral"
            />

            <Metric
              label="Locked"
              value={
                loading || !account
                  ? "Loading..."
                  : preciseMoney(account.lockedBalance)
              }
              sub="Account-level locked balance"
            />

            <Metric
              label="Open Positions"
              value={
                loading || !account
                  ? "Loading..."
                  : String(account.activePositions.length)
              }
              sub="Decoded from position bitmap"
            />
          </div>

          <div className="border-t border-white/10">
            <div className="flex flex-col gap-2 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-medium">Active Positions</h3>
                <p className="mt-1 text-xs text-zinc-600">
                  Current Perpl positions read directly from Monad mainnet.
                </p>
              </div>

              <span className="text-xs text-zinc-600">
                {account
                  ? `${account.activePositions.length} open`
                  : "Loading..."}
              </span>
            </div>

            {account && account.activePositions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left">
                  <thead className="border-y border-white/10 text-[10px] uppercase tracking-wider text-zinc-600">
                    <tr>
                      <th className="px-6 py-3 font-medium">Market</th>
                      <th className="px-4 py-3 font-medium">Side</th>
                      <th className="px-4 py-3 font-medium">Size</th>
                      <th className="px-4 py-3 font-medium">Entry</th>
                      <th className="px-4 py-3 font-medium">Mark</th>
                      <th className="px-4 py-3 font-medium">Collateral</th>
                      <th className="px-4 py-3 font-medium">Unrealized PnL</th>
                      <th className="px-6 py-3 font-medium">Entry Block</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-white/[0.06]">
                    {account.activePositions.map((position) => (
                      <tr key={position.perpetualId}>
                        <td className="px-6 py-4">
                          <p className="font-medium text-zinc-200">
                            {position.name}
                          </p>
                          <p className="mt-1 font-mono text-xs text-zinc-600">
                            Perp #{position.perpetualId}
                          </p>
                        </td>

                        <td className="px-4 py-4">
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-medium ${
                              position.side === "LONG"
                                ? "bg-emerald-400/10 text-emerald-300"
                                : position.side === "SHORT"
                                  ? "bg-red-400/10 text-red-300"
                                  : "bg-white/5 text-zinc-400"
                            }`}
                          >
                            {position.side}
                          </span>
                        </td>

                        <td className="px-4 py-4 font-mono text-sm text-zinc-300">
                          {position.size} {position.symbol}
                        </td>

                        <td className="px-4 py-4 font-mono text-sm text-zinc-300">
                          {price(position.entryPrice)}
                        </td>

                        <td className="px-4 py-4 font-mono text-sm text-zinc-300">
                          {position.markPriceValid
                            ? price(position.markPrice)
                            : "Invalid"}
                        </td>

                        <td className="px-4 py-4 font-mono text-sm text-zinc-300">
                          {preciseMoney(position.collateral)}
                        </td>

                        <td
                          className={`px-4 py-4 font-mono text-sm font-medium ${
                            position.pnl > 0
                              ? "text-emerald-400"
                              : position.pnl < 0
                                ? "text-red-400"
                                : "text-zinc-300"
                          }`}
                        >
                          {preciseMoney(position.pnl)}
                        </td>

                        <td className="px-6 py-4 font-mono text-sm text-zinc-500">
                          {position.entryBlock.toLocaleString("en-US")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : loading ? (
              <div className="border-t border-white/10 px-6 py-8 text-center text-sm text-zinc-600">
                Reading position state from Monad...
              </div>
            ) : (
              <div className="border-t border-white/10 px-6 py-8 text-center">
                <p className="text-sm text-zinc-400">No open positions.</p>
                <p className="mt-2 text-xs text-zinc-600">
                  Position bitmap is currently empty for this Perpl account.
                </p>
              </div>
            )}
          </div>

          <HistoricalTraderAnalytics
            accountId={account?.accountId ?? null}
          />

          <div className="flex flex-col gap-3 border-t border-white/10 px-6 py-4 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Source{" "}
              <span className="text-zinc-300">
                Perpl Exchange · Monad Mainnet
              </span>
              {account?.frozen ? (
                <span className="ml-2 text-amber-300">· Account frozen</span>
              ) : null}
            </span>

            <span>
              {data?.updatedAt
                ? `Updated ${new Date(data.updatedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}`
                : "Waiting for onchain data"}
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
