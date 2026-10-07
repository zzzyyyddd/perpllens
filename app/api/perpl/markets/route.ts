import { NextResponse } from "next/server";
import { fetchPerplContext } from "@/app/lib/perpl-public";

const PERPL_API = "https://app.perpl.xyz/api";

async function fetchJsonWithRetry(url: string) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        next: {
          revalidate: 60,
        },
        signal: AbortSignal.timeout(7000),
      });

      if (!response.ok) {
        throw new Error(`Perpl API returned ${response.status}`);
      }

      return await response.json();
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

function calculateVolatility(
  candles: Array<{
    o: number;
    h: number;
    l: number;
  }>,
  priceDecimals: number
) {
  if (!candles.length) return null;

  const divisor = 10 ** priceDecimals;

  const open = candles[0].o / divisor;

  if (!open) return null;

  const high =
    Math.max(...candles.map((candle) => candle.h)) / divisor;

  const low =
    Math.min(...candles.map((candle) => candle.l)) / divisor;

  return ((high - low) / open) * 100;
}

export async function GET() {
  try {
    const context = await fetchPerplContext();

    const now = Date.now();
    const from = now - 24 * 60 * 60 * 1000;

    const markets = await Promise.all(
      context.markets.map(
        async (market: {
          id: number;
          config: {
            price_decimals: number;
          };
          [key: string]: unknown;
        }) => {
          try {
            const candleData = await fetchJsonWithRetry(
              `${PERPL_API}/v1/market-data/${market.id}/candles/3600/${from}-${now}`
            );

            const volatility24h = calculateVolatility(
              candleData.d ?? [],
              market.config.price_decimals
            );

            return {
              ...market,
              analytics: {
                volatility24h,
              },
            };
          } catch (error) {
            console.error(
              `Candle analytics failed for market ${market.id}:`,
              error
            );

            // Context data remains usable even if one candle request fails.
            return {
              ...market,
              analytics: {
                volatility24h: null,
              },
            };
          }
        }
      )
    );

    return NextResponse.json({
      chain: context.chain,
      tokens: context.tokens,
      markets,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Perpl market API error after retries:", error);

    return NextResponse.json(
      {
        error: "Perpl market data temporarily unavailable",
      },
      { status: 503 }
    );
  }
}
