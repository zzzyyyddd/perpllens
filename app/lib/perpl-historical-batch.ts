import "server-only";

import { fetchPerplEnvio } from "./perpl-envio-fetch";

import {
  type HistoricalCursor,
  type HistoricalEventType,
  type HistoricalIndexedEvent,
} from "./perpl-historical-sync-types";

export const HISTORICAL_BATCH_SIZE = 100;

const HISTORICAL_EVENT_FIELDS: Record<HistoricalEventType, string> = {
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
};


type HistoricalBatchRow = HistoricalIndexedEvent &
  Record<string, unknown>;

type GraphQLResult = {
  data?: { events: HistoricalBatchRow[] };
  errors?: Array<{ message?: string }>;
};

export async function fetchHistoricalBatch(
  accountId: string,
  eventType: HistoricalEventType,
  targetBlockNumber: string,
  cursor: HistoricalCursor | null,
): Promise<HistoricalBatchRow[]> {
  if (!/^\d+$/.test(accountId)) {
    throw new Error("Invalid Perpl account ID");
  }

  if (!/^\d+$/.test(targetBlockNumber)) {
    throw new Error("Invalid target block");
  }

  const endpoint = process.env.ENVIO_GRAPHQL_URL?.trim();

  if (!endpoint) {
    throw new Error("Envio endpoint unavailable");
  }

  const cursorFilter = cursor
    ? {
        _or: [
          { blockNumber: { _gt: cursor.blockNumber } },
          {
            blockNumber: { _eq: cursor.blockNumber },
            logIndex: { _gt: cursor.logIndex },
          },
          {
            blockNumber: { _eq: cursor.blockNumber },
            logIndex: { _eq: cursor.logIndex },
            id: { _gt: cursor.id },
          },
        ],
      }
    : {};

  const query = `
    query HistoricalBatch(
      $where: ${eventType}_bool_exp!
      $limit: Int!
    ) {
      events: ${eventType}(
        where: $where
        order_by: [
          { blockNumber: asc }
          { logIndex: asc }
          { id: asc }
        ]
        limit: $limit
      ) {
        id
        accountId
        blockNumber
        logIndex
        transactionHash
        ${HISTORICAL_EVENT_FIELDS[eventType]}
      }
    }
  `;

  const response = await fetchPerplEnvio(endpoint, {
    query,
    variables: {
        where: {
          accountId: { _eq: accountId },
          blockNumber: { _lte: targetBlockNumber },
          ...cursorFilter,
        },
        limit: HISTORICAL_BATCH_SIZE,
      },
  }, 15000);

  if (!response.ok) {
    throw new Error(`Envio HTTP ${response.status}`);
  }

  const payload = (await response.json()) as GraphQLResult;

  if (payload.errors?.length) {
    throw new Error(
      payload.errors[0]?.message ?? "Envio query failed",
    );
  }

  if (!Array.isArray(payload.data?.events)) {
    throw new Error("Invalid Envio batch response");
  }

  return payload.data.events;
}
