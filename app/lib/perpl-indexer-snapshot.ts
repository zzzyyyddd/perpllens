import "server-only";

import { fetchPerplEnvio } from "./perpl-envio-fetch";

type IndexerMetadata = {
  chainId: number;
  startBlock: number;
  progressBlock: number;
  sourceBlock: number;
  isReady: boolean;
};

type MetadataResponse = {
  data?: {
    _meta: IndexerMetadata[];
  };
  errors?: Array<{ message: string }>;
};

export async function getPerplIndexerSnapshot(): Promise<{
  targetBlockNumber: string;
  startBlockNumber: string;
}> {
  const endpoint = process.env.ENVIO_GRAPHQL_URL?.trim();

  if (!endpoint) {
    throw new Error("Envio endpoint unavailable");
  }

  const response = await fetchPerplEnvio(endpoint, {
    query: `
        query PerplIndexerSnapshot {
          _meta {
            chainId
            startBlock
            progressBlock
            sourceBlock
            isReady
          }
        }
      `,
  }, 10000);

  if (!response.ok) {
    throw new Error(`Envio metadata HTTP ${response.status}`);
  }

  const payload = (await response.json()) as MetadataResponse;

  if (payload.errors?.length) {
    throw new Error(
      payload.errors[0]?.message ?? "Envio metadata failed",
    );
  }

  const meta = payload.data?._meta?.find(
    (item) => item.chainId === 143,
  );

  if (
    !meta ||
    !meta.isReady ||
    !Number.isSafeInteger(meta.startBlock) ||
    !Number.isSafeInteger(meta.progressBlock) ||
    !Number.isSafeInteger(meta.sourceBlock) ||
    meta.progressBlock < meta.startBlock ||
    meta.progressBlock > meta.sourceBlock
  ) {
    throw new Error("Envio indexer snapshot unavailable");
  }

  return {
    targetBlockNumber: String(meta.progressBlock),
    startBlockNumber: String(meta.startBlock),
  };
}
