import { NextResponse } from "next/server";
import { perplAuthenticatedGet } from "@/app/lib/perpl-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [wallet, positions, fills] = await Promise.all([
      perplAuthenticatedGet("/v1/trading/wallet"),
      perplAuthenticatedGet("/v1/trading/positions"),
      perplAuthenticatedGet("/v1/trading/fills?count=50"),
    ]);

    return NextResponse.json(
      {
        wallet,
        positions,
        fills,
        updatedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error(
      "Perpl account API error:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return NextResponse.json(
      {
        error: "Unable to load Perpl account data",
      },
      { status: 502 }
    );
  }
}
