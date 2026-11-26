import { NextResponse } from "next/server";
import { TEXTILE_API } from "@/lib/config";

/** GET /api/rfq/status?rfqId=&claimToken= — poll an RFQ until it fills. */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const rfqId = searchParams.get("rfqId");
    const claimToken = searchParams.get("claimToken");
    if (!rfqId || !claimToken) {
      return NextResponse.json(
        { error: "rfqId and claimToken are required." },
        { status: 400 },
      );
    }
    const res = await fetch(`${TEXTILE_API}/rfq/${rfqId}`, {
      headers: { "X-Rfq-Claim": claimToken },
      signal: AbortSignal.timeout(30_000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: `Textile status failed: ${res.status}` },
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
