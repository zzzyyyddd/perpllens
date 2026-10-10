import "server-only";

import { fetchPerplEnvio } from "./perpl-envio-fetch";
import type { HistoricalRows } from "./perpl-historical-analytics";

const FIELDS = {
  PositionOpen: `
    perpId positionType leverageHdths depositCNS pricePNS lotLNS
    insFeeCNS protFeeCNS timestamp
  `,
  PositionIncrease: `
    perpId positionType leverageHdths startDepositCNS endDepositCNS
    pricePNS startLotLNS endLotLNS insFeeCNS protFeeCNS timestamp
  `,
  PositionDecrease: `
    perpId positionType startDepositCNS endDepositCNS
    startLotLNS endLotLNS deltaPnlCNS fundingCNS timestamp
  `,
  PositionClose: `
    perpId positionType pricePNS deltaPnlCNS fundingCNS timestamp
  `,
  PositionInvert: `
    perpId positionType leverageHdths startDepositCNS endDepositCNS
    pricePNS startLotLNS endLotLNS deltaPnlCNS fundingCNS
    insFeeCNS protFeeCNS timestamp
  `,
  PositionLiquidation: `
    perpId positionType deltaPnlCNS fundingCNS timestamp
  `,
} as const;

type EventType = keyof typeof FIELDS;

const TYPES = Object.keys(FIELDS) as EventType[];

const KEYS = {
  PositionOpen: "positionOpens",
  PositionIncrease: "positionIncreases",
  PositionDecrease: "positionDecreases",
  PositionClose: "positionCloses",
  PositionInvert: "positionInverts",
  PositionLiquidation: "positionLiquidations",
} as const;

export async function fetchRecentLifecycleRows(
  accountId: string,
  limit = 50,
): Promise<HistoricalRows> {
  if (!/^\d{1,20}$/.test(accountId)) {
    throw new Error("Invalid account ID");
  }

  const endpoint = process.env.ENVIO_GRAPHQL_URL?.trim();

  if (!endpoint) {
    throw new Error("Envio endpoint unavailable");
  }

  const results = await Promise.all(
    TYPES.map(async (eventType) => {
      const query = `
        query RecentLifecycle(
          $where: ${eventType}_bool_exp!
          $limit: Int!
        ) {
          events: ${eventType}(
            where: $where
            order_by: [
              { blockNumber: desc }
              { logIndex: desc }
              { id: desc }
            ]
            limit: $limit
          ) {
            accountId
            blockNumber
            logIndex
            transactionHash
            ${FIELDS[eventType]}
          }
        }
      `;

      const response = await fetchPerplEnvio(
        endpoint,
        {
          query,
          variables: {
            where: {
              accountId: { _eq: accountId },
            },
            limit,
          },
        },
        10000,
      );

      if (!response.ok) {
        throw new Error(
          `${eventType}: Envio HTTP ${response.status}`,
        );
      }

      const payload = (await response.json()) as {
        data?: { events?: unknown[] };
        errors?: Array<{ message?: string }>;
      };

      if (payload.errors?.length) {
        throw new Error(
          `${eventType}: ${payload.errors[0]?.message}`,
        );
      }

      if (!Array.isArray(payload.data?.events)) {
        throw new Error(`${eventType}: invalid response`);
      }

      return {
        eventType,
        rows: payload.data.events,
      };
    }),
  );

  const rows: HistoricalRows = {
    positionOpens: [],
    positionIncreases: [],
    positionDecreases: [],
    positionCloses: [],
    positionInverts: [],
    positionLiquidations: [],
    takerOrderFills: [],
  };

  for (const result of results) {
    const key = KEYS[result.eventType];

    // Event fields differ by category; conversion is performed
    // by the existing historicalRowsToEngine function.
    Object.assign(rows, {
      [key]: result.rows,
    });
  }

  return rows;
}

export async function fetchLifecycleBlockRange(
  accountId: string,
  fromBlock: string,
  toBlock: string,
): Promise<HistoricalRows> {
  if (
    !/^\d{1,20}$/.test(accountId) ||
    !/^\d+$/.test(fromBlock) ||
    !/^\d+$/.test(toBlock) ||
    BigInt(fromBlock) > BigInt(toBlock)
  ) {
    throw new Error("Invalid lifecycle block range");
  }

  const endpoint = process.env.ENVIO_GRAPHQL_URL?.trim();

  if (!endpoint) {
    throw new Error("Envio endpoint unavailable");
  }

  const results = await Promise.all(
    TYPES.map(async (eventType) => {
      const collected: unknown[] = [];
      const pageSize = 100;
      const maxPages = 20;

      for (let page = 0; page < maxPages; page++) {
        const query = `
          query LifecycleBlockRange(
            $where: ${eventType}_bool_exp!
            $limit: Int!
            $offset: Int!
          ) {
            events: ${eventType}(
              where: $where
              order_by: [
                { blockNumber: asc }
                { logIndex: asc }
                { id: asc }
              ]
              limit: $limit
              offset: $offset
            ) {
              accountId
              blockNumber
              logIndex
              transactionHash
              ${FIELDS[eventType]}
            }
          }
        `;

        const response = await fetchPerplEnvio(
          endpoint,
          {
            query,
            variables: {
              where: {
                accountId: { _eq: accountId },
                blockNumber: {
                  _gte: fromBlock,
                  _lte: toBlock,
                },
              },
              limit: pageSize,
              offset: page * pageSize,
            },
          },
          10000,
        );

        if (!response.ok) {
          throw new Error(
            `${eventType}: HTTP ${response.status}`,
          );
        }

        const payload = (await response.json()) as {
          data?: { events?: unknown[] };
          errors?: Array<{ message?: string }>;
        };

        if (payload.errors?.length) {
          throw new Error(
            `${eventType}: ${payload.errors[0]?.message}`,
          );
        }

        const batch = payload.data?.events;

        if (!Array.isArray(batch)) {
          throw new Error(`${eventType}: invalid response`);
        }

        collected.push(...batch);

        if (batch.length < pageSize) {
          return { eventType, rows: collected };
        }
      }

      throw new Error(
        `${eventType}: pagination safety limit reached`,
      );
    }),
  );

  const rows: HistoricalRows = {
    positionOpens: [],
    positionIncreases: [],
    positionDecreases: [],
    positionCloses: [],
    positionInverts: [],
    positionLiquidations: [],
    takerOrderFills: [],
  };

  for (const result of results) {
    Object.assign(rows, {
      [KEYS[result.eventType]]: result.rows,
    });
  }

  return rows;
}
