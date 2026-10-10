"use client";

import { useEffect, useState } from "react";

type Activity = {
  id: string;
  eventType: string;
  perpId: string;
  timestamp: string;
  transactionHash: string;
};

type Response = {
  status: string;
  events?: Activity[];
  isPartial?: boolean;
};

export default function PerplRecentActivity({
  accountId,
}: {
  accountId: string;
}) {
  const [events, setEvents] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [partial, setPartial] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setEvents([]);
    setError("");

    fetch(`/api/perpl/recent-activity?accountId=${encodeURIComponent(accountId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<Response>;
      })
      .then((result) => {
        if (!active) return;
        setEvents(result.events ?? []);
        setPartial(Boolean(result.isPartial));
      })
      .catch((cause) => {
        if (active) setError(String(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [accountId]);

  return (
    <section className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">Recent On-Chain Activity</h3>
        <span className="text-xs text-amber-300">
          Recent sample · Not full history
        </span>
      </div>

      {loading && <p className="mt-4 text-sm text-gray-400">Loading recent events...</p>}
      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
      {partial && <p className="mt-3 text-xs text-amber-300">Partial sample: some event queries timed out.</p>}

      {!loading && !error && events.length === 0 && (
        <p className="mt-4 text-sm text-gray-400">No recent events returned.</p>
      )}

      {events.length > 0 && (
        <div className="mt-4 max-h-80 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-gray-400">
              <tr>
                <th className="py-2">Event</th>
                <th>Market</th>
                <th>Time</th>
                <th>Transaction</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className="border-t border-white/10">
                  <td className="py-2">{event.eventType}</td>
                  <td>{event.perpId}</td>
                  <td>{new Date(Number(event.timestamp) * 1000).toLocaleString()}</td>
                  <td className="font-mono text-xs">
                    {event.transactionHash.slice(0, 10)}...
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
