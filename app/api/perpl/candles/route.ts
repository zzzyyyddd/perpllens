import { NextRequest, NextResponse } from "next/server";

const BASE_URL = "https://app.perpl.xyz/api/v1/market-data";

async function fetchWithRetry(url: string) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`Perpl API returned ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      lastError = error;

      if (attempt < 3) {
        await new Promise((resolve) =>
          setTimeout(resolve, attempt * 500)
        );
      }
    }
  }

  throw lastError;
}

export async function GET(request: NextRequest) {
  try {
    const marketId = request.nextUrl.searchParams.get("marketId") ?? "1";

    if (!/^\d+$/.test(marketId)) {
      return NextResponse.json(
        { error: "Invalid market ID" },
        { status: 400 }
      );
    }

    const now = Date.now();
    const from = now - 24 * 60 * 60 * 1000;

    const url =
      `${BASE_URL}/${marketId}/candles/3600/${from}-${now}`;

    const data = await fetchWithRetry(url);

    return NextResponse.json({
      marketId: Number(marketId),
      resolution: data.r,
      candles: data.d ?? [],
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Perpl candle API error:", error);

    return NextResponse.json(
      { error: "Perpl candle data temporarily unavailable" },
      { status: 503 }
    );
  }
}
