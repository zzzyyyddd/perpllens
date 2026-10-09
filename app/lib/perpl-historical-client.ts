import "server-only";

import type { HistoricalRows } from "./perpl-historical-analytics";

const PAGE_SIZE = 500;

type GraphQLError = {
  message?: string;
};

type GraphQLResponse<T> = {
  data?: T;
  errors?: GraphQLError[];
};

export class HistoricalDataUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HistoricalDataUnavailableError";
  }
}

function endpoint(): string {
  const value = process.env.ENVIO_GRAPHQL_URL?.trim();

  if (!value) {
    throw new HistoricalDataUnavailableError(
      "Historical indexer endpoint is not configured",
    );
  }

  return value;
}

async function graphql<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(endpoint(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    });
  } catch {
    throw new HistoricalDataUnavailableError(
      "Historical indexer is unreachable",
    );
  }

  if (!response.ok) {
    throw new HistoricalDataUnavailableError(
      `Historical indexer returned HTTP ${response.status}`,
    );
  }

  const payload = (await response.json()) as GraphQLResponse<T>;

  if (payload.errors?.length) {
    throw new HistoricalDataUnavailableError(
      payload.errors[0]?.message ?? "Historical indexer query failed",
    );
  }

  if (!payload.data) {
    throw new HistoricalDataUnavailableError(
      "Historical indexer returned no data",
    );
  }

  return payload.data;
}

const LIFECYCLE_QUERY = `
  query HistoricalLifecycle($accountId: numeric!, $limit: Int!, $offset: Int!) {
    positionOpens: PositionOpen(
      where: { accountId: { _eq: $accountId } }
      order_by: [{ blockNumber: asc }, { logIndex: asc }]
      limit: $limit
      offset: $offset
    ) {
      accountId perpId positionType leverageHdths depositCNS pricePNS lotLNS
      insFeeCNS protFeeCNS blockNumber timestamp transactionHash logIndex
    }

    positionIncreases: PositionIncrease(
      where: { accountId: { _eq: $accountId } }
      order_by: [{ blockNumber: asc }, { logIndex: asc }]
      limit: $limit
      offset: $offset
    ) {
      accountId perpId positionType leverageHdths startDepositCNS endDepositCNS
      pricePNS startLotLNS endLotLNS insFeeCNS protFeeCNS
      blockNumber timestamp transactionHash logIndex
    }

    positionDecreases: PositionDecrease(
      where: { accountId: { _eq: $accountId } }
      order_by: [{ blockNumber: asc }, { logIndex: asc }]
      limit: $limit
      offset: $offset
    ) {
      accountId perpId positionType startDepositCNS endDepositCNS
      startLotLNS endLotLNS deltaPnlCNS fundingCNS
      blockNumber timestamp transactionHash logIndex
    }

    positionCloses: PositionClose(
      where: { accountId: { _eq: $accountId } }
      order_by: [{ blockNumber: asc }, { logIndex: asc }]
      limit: $limit
      offset: $offset
    ) {
      accountId perpId positionType pricePNS deltaPnlCNS fundingCNS
      blockNumber timestamp transactionHash logIndex
    }

    positionInverts: PositionInvert(
      where: { accountId: { _eq: $accountId } }
      order_by: [{ blockNumber: asc }, { logIndex: asc }]
      limit: $limit
      offset: $offset
    ) {
      accountId perpId positionType leverageHdths startDepositCNS endDepositCNS
      pricePNS startLotLNS endLotLNS deltaPnlCNS fundingCNS
      insFeeCNS protFeeCNS blockNumber timestamp transactionHash logIndex
    }

    positionLiquidations: PositionLiquidation(
      where: { accountId: { _eq: $accountId } }
      order_by: [{ blockNumber: asc }, { logIndex: asc }]
      limit: $limit
      offset: $offset
    ) {
      accountId perpId positionType deltaPnlCNS fundingCNS
      blockNumber timestamp transactionHash logIndex
    }
  }
`;

type LifecyclePage = Omit<HistoricalRows, "takerOrderFills">;

function emptyLifecycle(): LifecyclePage {
  return {
    positionOpens: [],
    positionIncreases: [],
    positionDecreases: [],
    positionCloses: [],
    positionInverts: [],
    positionLiquidations: [],
  };
}

function appendLifecycle(
  target: LifecyclePage,
  page: LifecyclePage,
): void {
  target.positionOpens.push(...page.positionOpens);
  target.positionIncreases.push(...page.positionIncreases);
  target.positionDecreases.push(...page.positionDecreases);
  target.positionCloses.push(...page.positionCloses);
  target.positionInverts.push(...page.positionInverts);
  target.positionLiquidations.push(...page.positionLiquidations);
}

function pageIsFull(page: LifecyclePage): boolean {
  return (
    page.positionOpens.length === PAGE_SIZE ||
    page.positionIncreases.length === PAGE_SIZE ||
    page.positionDecreases.length === PAGE_SIZE ||
    page.positionCloses.length === PAGE_SIZE ||
    page.positionInverts.length === PAGE_SIZE ||
    page.positionLiquidations.length === PAGE_SIZE
  );
}

export async function fetchHistoricalLifecycleRows(
  accountId: string,
): Promise<LifecyclePage> {
  if (!/^\d+$/.test(accountId)) {
    throw new Error("Invalid Perpl account ID");
  }

  const rows = emptyLifecycle();

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await graphql<LifecyclePage>(LIFECYCLE_QUERY, {
      accountId,
      limit: PAGE_SIZE,
      offset,
    });

    appendLifecycle(rows, page);

    if (!pageIsFull(page)) {
      break;
    }
  }

  return rows;
}

const TX_BATCH_SIZE = 100;

const TAKER_FILLS_QUERY = `
  query HistoricalTakerFills($txHashes: [String!]!) {
    takerOrderFills: TakerOrderFill(
      where: { transactionHash: { _in: $txHashes } }
      order_by: [{ blockNumber: asc }, { logIndex: asc }]
    ) {
      entryPricePNS
      collatPricePNS
      pnlPricePNS
      lotLNS
      feeCNS
      amountCNS
      balanceCNS
      builderId
      builderFeeCNS
      blockNumber
      timestamp
      transactionHash
      logIndex
    }
  }
`;

type TakerFillPage = Pick<HistoricalRows, "takerOrderFills">;

function lifecycleTransactionHashes(rows: LifecyclePage): string[] {
  const hashes = new Set<string>();

  const groups = [
    rows.positionOpens,
    rows.positionIncreases,
    rows.positionDecreases,
    rows.positionCloses,
    rows.positionInverts,
    rows.positionLiquidations,
  ];

  for (const group of groups) {
    for (const row of group) {
      hashes.add(row.transactionHash);
    }
  }

  return [...hashes];
}

async function fetchTakerOrderFills(
  transactionHashes: string[],
): Promise<HistoricalRows["takerOrderFills"]> {
  const batches: string[][] = [];

  for (
    let start = 0;
    start < transactionHashes.length;
    start += TX_BATCH_SIZE
  ) {
    batches.push(
      transactionHashes.slice(start, start + TX_BATCH_SIZE),
    );
  }

  const fills: HistoricalRows["takerOrderFills"] = [];
  const CONCURRENCY = 3;

  for (let start = 0; start < batches.length; start += CONCURRENCY) {
    const group = batches.slice(start, start + CONCURRENCY);

    const results = await Promise.all(
      group.map((txHashes) =>
        graphql<TakerFillPage>(TAKER_FILLS_QUERY, { txHashes }),
      ),
    );

    for (const result of results) {
      fills.push(...result.takerOrderFills);
    }
  }

  return fills;
}

export async function fetchHistoricalRows(
  accountId: string,
): Promise<HistoricalRows> {
  const lifecycle = await fetchHistoricalLifecycleRows(accountId);

  const transactionHashes =
    lifecycleTransactionHashes(lifecycle);

  const takerOrderFills =
    transactionHashes.length === 0
      ? []
      : await fetchTakerOrderFills(transactionHashes);

  return {
    ...lifecycle,
    takerOrderFills,
  };
}
