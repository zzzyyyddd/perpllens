const PERPL_API = "https://app.perpl.xyz/api";

export type PerplMarketMetadata = {
  id: number;
  name: string;
  symbol?: string;
  size_units?: string;
  config: {
    price_decimals: number;
    size_decimals: number;
    is_open?: boolean;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type PerplContext = {
  chain: {
    chain_id: number;
    name: string;
    [key: string]: unknown;
  };
  tokens: Array<{
    symbol: string;
    decimals: number;
    [key: string]: unknown;
  }>;
  markets: PerplMarketMetadata[];
  [key: string]: unknown;
};

export async function fetchPerplContext(): Promise<PerplContext> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(`${PERPL_API}/v1/pub/context`, {
        next: {
          revalidate: 30,
        },
        signal: AbortSignal.timeout(7000),
      });

      if (!response.ok) {
        throw new Error(`Perpl context returned ${response.status}`);
      }

      return (await response.json()) as PerplContext;
    } catch (error) {
      lastError = error;

      if (attempt < 3) {
        await new Promise((resolve) =>
          setTimeout(resolve, attempt * 400)
        );
      }
    }
  }

  throw lastError;
}

export function getPerplMarket(
  context: PerplContext,
  marketId: number | null | undefined
) {
  if (marketId == null) return null;

  return (
    context.markets.find((market) => market.id === marketId) ??
    null
  );
}

export function perplPrice(
  rawPrice: number | null | undefined,
  priceDecimals: number | null | undefined
) {
  if (
    typeof rawPrice !== "number" ||
    typeof priceDecimals !== "number"
  ) {
    return null;
  }

  return rawPrice / 10 ** priceDecimals;
}
