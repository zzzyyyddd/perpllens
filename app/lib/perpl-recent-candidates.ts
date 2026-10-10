import "server-only";

import { fetchRecentLifecycleRows } from "./perpl-recent-events";
import { historicalRowsToEngine } from "./perpl-historical-analytics";
import { reconstructPositionLifecycles } from "./perpl-trade-reconstruction";

export async function findRecentTradeCandidates(accountId: string) {
  const rows = await fetchRecentLifecycleRows(accountId, 20);
  const { lifecycleEvents } = historicalRowsToEngine(rows);
  const lifecycles = reconstructPositionLifecycles(lifecycleEvents);

  return lifecycles
    .filter(
      (l) =>
        l.completeStart &&
        l.completeEnd &&
        l.openingTransactionHash &&
        l.closingTransactionHash,
    )
    .sort((a, b) => Number((b.closedAt ?? BigInt(0)) - (a.closedAt ?? BigInt(0))))
    .slice(0, 3)
    .map((l) => {
      const opening = lifecycleEvents.find(
        (e) =>
          e.transactionHash === l.openingTransactionHash &&
          e.logIndex === l.openingLogIndex,
      );

      const closing = lifecycleEvents.find(
        (e) =>
          e.transactionHash === l.closingTransactionHash &&
          e.logIndex === l.closingLogIndex,
      );

      return {
        perpId: l.perpId.toString(),
        openingTransactionHash: l.openingTransactionHash,
        closingTransactionHash: l.closingTransactionHash,
        fromBlock: opening?.blockNumber.toString(),
        toBlock: closing?.blockNumber.toString(),
      };
    })
    .filter(
      (c): c is {
        perpId: string;
        openingTransactionHash: string;
        closingTransactionHash: string;
        fromBlock: string;
        toBlock: string;
      } =>
        Boolean(c.fromBlock && c.toBlock),
    );
}
