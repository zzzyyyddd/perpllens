import "server-only";

import { fetchPerplEnvio } from "./perpl-envio-fetch";
import type { HistoricalRows } from "./perpl-historical-analytics";

type TakerFill = HistoricalRows["takerOrderFills"][number];

type GraphQLResult = {
  data?: {
    takerOrderFills: TakerFill[];
  };
  errors?: Array<{ message?: string }>;
};

const PAGE_SIZE = 100;
const MAX_PAGES = 100;

const QUERY = `
  query HistoricalTakerFills(
    $txHashes: [String!]!
    $limit: Int!
    $offset: Int!
  ) {
    takerOrderFills: TakerOrderFill(
      where: { transactionHash: { _in: $txHashes } }
      order_by: [
        { blockNumber: asc }
        { logIndex: asc }
        { transactionHash: asc }
      ]
      limit: $limit
      offset: $offset
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

export async function fetchHistoricalTakerFills(
  transactionHashes: string[],
): Promise<TakerFill[]> {
  if (transactionHashes.length === 0) return [];

  if (
    transactionHashes.length > 100 ||
    transactionHashes.some(
      (hash) => !/^0x[a-fA-F0-9]{64}$/.test(hash),
    )
  ) {
    throw new Error("Invalid transaction hash batch");
  }

  const endpoint = process.env.ENVIO_GRAPHQL_URL?.trim();

  if (!endpoint) {
    throw new Error("Envio endpoint unavailable");
  }

  const allFills: TakerFill[] = [];
  const seen = new Set<string>();

  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await fetchPerplEnvio(
      endpoint,
      {
        query: QUERY,
        variables: {
          txHashes: transactionHashes,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        },
      },
      15000,
    );

    if (!response.ok) {
      throw new Error(`Envio HTTP ${response.status}`);
    }

    const payload = (await response.json()) as GraphQLResult;

    if (payload.errors?.length) {
      throw new Error(
        payload.errors[0]?.message ??
          "Envio taker fills query failed",
      );
    }

    const rows = payload.data?.takerOrderFills;

    if (!Array.isArray(rows)) {
      throw new Error("Invalid Envio taker fills response");
    }

    for (const fill of rows) {
      const key =
        `${fill.transactionHash.toLowerCase()}:${fill.logIndex}`;

      if (seen.has(key)) {
        throw new Error("Duplicate taker fill across pages");
      }

      seen.add(key);
      allFills.push(fill);
    }

    if (rows.length < PAGE_SIZE) {
      return allFills;
    }
  }

  throw new Error("Taker fill pagination safety limit reached");
}
