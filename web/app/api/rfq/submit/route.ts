import { NextResponse } from "next/server";
import { TEXTILE_API } from "@/lib/config";

/** POST /api/rfq/submit — report the broadcast swap hash to Textile. */
export async function POST(req: Request) {
  try {
    const { rfqId, claimToken, txHash } = (await req.json()) as {
      rfqId: string;
      claimToken: string;
      txHash: string;
    };
    if (!rfqId || !claimToken || !txHash) {
      return NextResponse.json(
        { error: "rfqId, claimToken and txHash are required." },
        { status: 400 },
      );
    }
    const res = await fetch(`${TEXTILE_API}/rfq/${rfqId}/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Rfq-Claim": claimToken,
      },
      body: JSON.stringify({ txHash }),
      signal: AbortSignal.timeout(30_000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: `Textile submit failed: ${res.status}` },
        { status: 502 },
      );
    }
    return NextResponse.json(json);
  } catch {
    return NextResponse.json(
      { error: "Could not reach Textile — please try again." },
      { status: 502 },
    );
  }
}
