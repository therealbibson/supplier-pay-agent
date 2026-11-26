import { NextResponse } from "next/server";
import { TEXTILE_API } from "@/lib/config";

/**
 * POST /api/rfq/request — firm Textile quote.
 * The firm request can block up to ~70 s while makers answer, so this
 * route runs long (maxDuration 75) and the client waits up to 75 s.
 * Sends unsigned first; if Textile answers 401 proof_of_control_required,
 * the client signs the TakerControl message and retries with takerProof.
 */
export const maxDuration = 75;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const res = await fetch(`${TEXTILE_API}/rfq/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(75_000),
    });
    const json = await res.json().catch(() => ({}));
    if (res.status === 401) {
      const reason = (json as { error?: { details?: { reason?: string } } })
        .error?.details?.reason;
      if (reason === "proof_of_control_required") {
        return NextResponse.json(
          { error: "proof_of_control_required", reason },
          { status: 401 },
        );
      }
    }
    if (!res.ok) {
      return NextResponse.json(
        { error: `Textile quote failed: ${res.status}` },
        { status: res.status === 429 ? 429 : 502 },
      );
    }
    return NextResponse.json(json);
  } catch (err) {
    const message =
      err instanceof Error && err.name === "TimeoutError"
        ? "Textile is taking too long to quote — please try again."
        : "Could not reach Textile — please try again.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
