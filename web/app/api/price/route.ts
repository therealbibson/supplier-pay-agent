import { NextResponse } from "next/server";

/**
 * GET /api/price — a token's USD price from CoinGecko's free public API
 * (no key). Used only as a fallback for the balance card's USDT-equivalent
 * line, when Textile has no quote for the selected coin (CELO has no
 * Textile corridor at all; wBRL/wARS/wMXN/wCOP makers are often offline).
 *
 * Query: ?address=0x… (an ERC-20 on Celo) or ?coin=CELO (native token,
 * priced via CoinGecko's `simple/price` id endpoint).
 *
 * CoinGecko's free tier allows only 1 contract address per
 * token_price call, so this route prices one token per request and
 * caches the answer in memory for 60 seconds to stay well inside the
 * rate limit. A missing price is a 502 with an error — the caller
 * treats it as "no line", never as a zero.
 */
const COINGECKO = "https://api.coingecko.com/api/v3";

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { price: number; at: number }>();

export async function GET(req: Request) {
  const url = new URL(req.url);
  const address = url.searchParams.get("address")?.toLowerCase() ?? null;
  const coin = url.searchParams.get("coin");

  let cgUrl: string;
  let key: string;
  if (coin === "CELO") {
    cgUrl = `${COINGECKO}/simple/price?ids=celo&vs_currencies=usd`;
    key = "celo";
  } else if (address && /^0x[0-9a-f]{40}$/.test(address)) {
    cgUrl = `${COINGECKO}/simple/token_price/celo?contract_addresses=${address}&vs_currencies=usd`;
    key = address;
  } else {
    return NextResponse.json(
      { error: "Pass ?address=0x… or ?coin=CELO." },
      { status: 400 },
    );
  }

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return NextResponse.json({ data: { usd: hit.price } });
  }

  try {
    const res = await fetch(cgUrl, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => ({}))) as Record<
      string,
      { usd?: unknown } | undefined
    >;
    // CoinGecko returns token_price keys lowercased; the id endpoint
    // returns { celo: { usd } }.
    const price =
      coin === "CELO" ? json?.celo?.usd : address ? json?.[address]?.usd : undefined;
    if (typeof price !== "number" || !(price > 0)) {
      return NextResponse.json(
        { error: "No price available for this token." },
        { status: 502 },
      );
    }
    cache.set(key, { price, at: Date.now() });
    return NextResponse.json({ data: { usd: price } });
  } catch {
    return NextResponse.json(
      { error: "Could not reach the price source." },
      { status: 502 },
    );
  }
}
