type Props = {
  totalTrades: number;
  winRate: number | null;
  profitFactor: number | null;
  maxDrawdown: string | null;
};

export default function TraderRiskPassport({
  totalTrades,
  winRate,
  profitFactor,
  maxDrawdown,
}: Props) {
  const sufficient = totalTrades >= 30;

  return (
    <section className="border-b border-white/10 px-6 py-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Trader Risk Passport</h3>
        <span className="text-xs text-amber-300">
          {sufficient ? "Historical Metrics" : "Insufficient History"}
        </span>
      </div>

      <p className="mt-2 text-xs text-zinc-500">
        On-chain trading performance snapshot. Not a prediction
        or investment recommendation.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Completed Trades", String(totalTrades)],
          ["Win Rate", winRate === null ? "N/A" : `${winRate.toFixed(1)}%`],
          ["Profit Factor", profitFactor === null ? "N/A" : profitFactor.toFixed(2)],
          ["Max Drawdown", maxDrawdown ?? "N/A"],
        ].map(([label, value]) => (
          <div key={label} className="rounded border border-white/10 p-3">
            <p className="text-xs text-zinc-500">{label}</p>
            <p className="mt-2 text-lg font-semibold">{value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
