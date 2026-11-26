import { NextResponse } from "next/server";
import { TEXTILE_API } from "@/lib/config";

/** POST /api/rfq/preview — free Textile estimate, no wallet or signature. */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const res = await fetch(`${TEXTILE_API}/rfq/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Textile has no corridor for this pair at all (e.g. local→local
      // or CELO→local: "No RFQ corridor for this pair"). Report it as a
      // plain no-quote so the UI shows the usual "no quote available"
      // message instead of a raw error.
      const reason = (
        json as { error?: { details?: { reason?: string } } }
      ).error?.details?.reason;
      if (reason === "corridor_unavailable") {
        return NextResponse.json({
          data: { status: "no_quote", reason },
        });
      }
      return NextResponse.json(
        { error: `Textile preview failed: ${res.status}` },
        { status: res.status === 429 ? 429 : 502 },
      );
    }
    return NextResponse.json(json);
  } catch (err) {
    const message =
      err instanceof Error && err.name === "TimeoutError"
        ? "Textile preview timed out — please try again."
        : "Could not reach Textile — please try again.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
