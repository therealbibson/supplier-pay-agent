/**
 * USD pricing for the balance card's USDT-equivalent line — the fallback
 * when Textile has no quote for the selected coin (CELO has no Textile
 * corridor; wBRL/wARS/wMXN/wCOP makers are often offline). Prices come
 * from CoinGecko's free public API via the app's own /api/price route
 * (server-side, no key), never straight from the browser.
 */

/** USD price of one whole token. Returns null when no price exists. */
export async function fetchTokenPriceUsd(args: {
  address?: string;
  coin?: string;
}): Promise<number | null> {
  const params = new URLSearchParams();
  if (args.coin) params.set("coin", args.coin);
  if (args.address) params.set("address", args.address);
  const res = await fetch(`/api/price?${params}`, {
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: { usd?: unknown };
  };
  const price = json.data?.usd;
  return typeof price === "number" && price > 0 ? price : null;
}

/**
 * Convert a token balance to its USD value in 6-decimal units (like
 * USD₮), rounded to the nearest unit. String-based BigInt math, so tiny
 * prices (e.g. IDRX at $0.00005427) stay exact — no float drift.
 */
export function usdValueFromPrice(
  balance: bigint,
  balanceDecimals: number,
  priceUsd: number,
): bigint {
  // Parse the price as mantissa * 10^exp, handling exponent form
  // ("5.427e-05") as well as plain decimals ("0.00005427").
  const [mantissaPart, expPart] = priceUsd.toString().toLowerCase().split("e");
  const exp = expPart ? Number.parseInt(expPart, 10) : 0;
  const [wholeRaw = "0", fracRaw = ""] = mantissaPart.split(".");
  const digits = (wholeRaw + fracRaw).replace(/^0+(?=\d)/, "") || "0";
  const mantissa = BigInt(digits);
  const priceExp = exp - fracRaw.length; // price = mantissa * 10^priceExp

  // value in 6dp units = balance * price * 10^6 / 10^balanceDecimals
  //                     = balance * mantissa * 10^(priceExp + 6 - balanceDecimals)
  const shift = priceExp + 6 - balanceDecimals;
  if (shift >= 0) {
    return balance * mantissa * 10n ** BigInt(shift);
  }
  // Divide, rounding half up.
  const divisor = 10n ** BigInt(-shift);
  return (balance * mantissa + divisor / 2n) / divisor;
}
