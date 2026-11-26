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
