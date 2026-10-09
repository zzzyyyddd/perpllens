import { NextRequest, NextResponse } from "next/server";
import { getPerplDb } from "@/app/lib/perpl-db";
import { runPerplSyncBatch } from "@/app/lib/perpl-sync-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { status: "invalid_request" },
      { status: 400 },
    );
  }

  const accountId =
    typeof body === "object" &&
    body !== null &&
    "accountId" in body &&
    typeof body.accountId === "string"
      ? body.accountId
      : "";

  if (!/^\d{1,20}$/.test(accountId)) {
    return NextResponse.json(
      { status: "invalid_request" },
      { status: 400 },
    );
  }

  try {
    const sql = getPerplDb();

    const globalRows = await sql`
      SELECT perpl_claim_global_sync_slot() AS allowed
    `;

    if (globalRows[0]?.allowed !== true) {
      return NextResponse.json(
        { status: "throttled", scope: "global" },
        { status: 429 },
      );
    }

    const accountRows = await sql`
      SELECT perpl_claim_sync_slot(${accountId}) AS allowed
    `;

    if (accountRows[0]?.allowed !== true) {
      return NextResponse.json(
        { status: "throttled", scope: "account" },
        { status: 429 },
      );
    }

    const result = await runPerplSyncBatch(accountId);

    return NextResponse.json(result, {
      status: result.status === "busy" ? 202 : 200,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Public sync request failed", error);

    return NextResponse.json(
      { status: "error", error: "Sync request failed" },
      { status: 500 },
    );
  }
}
