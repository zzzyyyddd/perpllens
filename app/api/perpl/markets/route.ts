import { NextResponse } from "next/server";

const PERPL_CONTEXT_URL =
  "https://app.perpl.xyz/api/v1/pub/context";

async function fetchPerplContext() {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(PERPL_CONTEXT_URL, {
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

export async function GET() {
  try {
    const data = await fetchPerplContext();

    return NextResponse.json({
      chain: data.chain,
      tokens: data.tokens,
      markets: data.markets,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Perpl API error after retries:", error);

    return NextResponse.json(
      {
        error: "Perpl market data temporarily unavailable",
      },
      { status: 503 }
    );
  }
}
