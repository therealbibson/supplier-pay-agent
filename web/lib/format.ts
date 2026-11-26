import { formatUnits } from "viem";

/**
 * Shared display formatting for token amounts — the one place that
 * decides how an amount looks on screen.
 *
 * Rule: minimum 2 decimal places, maximum 4, trailing zeros trimmed
 * down to 2, with thousands separators:
 *   1250.5       -> "1,250.50"
 *   72214.8312   -> "72,214.8312"
 *   0.000000482  -> "0.00"
 *   100          -> "100.00"
 *
 * Display-only: this never changes any on-chain value (amounts sent,
 * approvals, quotes). It only formats strings for rendering.
 *
 * Implemented on strings (not floats) so large values stay exact and
 * rounding to 4 places is done properly, with carry into the whole
 * part when needed (e.g. 1.99999 -> "2.00").
 */
export function formatDecimalAmount(value: string): string {
  const s = value.trim();
  if (s === "" || s === "-" || Number.isNaN(Number(s))) return "0.00";
  let neg = false;
  let rest = s;
  if (rest.startsWith("-")) {
    neg = true;
    rest = rest.slice(1);
  }
  const [wholeRaw = "0", fracRaw = ""] = rest.split(".");
  let whole = wholeRaw.replace(/^0+(?=\d)/, "") || "0";
  let frac = fracRaw;

  // Round the fraction to at most 4 places.
  if (frac.length > 4) {
    const keep = frac.slice(0, 4);
    const nextDigit = frac.charCodeAt(4) - 48;
    if (nextDigit >= 5) {
      // Add 1 to the 4-digit fraction, carrying into the whole part.
      let n = BigInt(keep || "0") + 1n;
      if (n >= 10000n) {
        whole = (BigInt(whole) + 1n).toString();
        frac = "0000";
      } else {
        frac = n.toString().padStart(4, "0");
      }
    } else {
      frac = keep;
    }
  }

  // Trim trailing zeros, but keep at least 2 places; pad to 2.
  while (frac.length > 2 && frac.endsWith("0")) frac = frac.slice(0, -1);
  while (frac.length < 2) frac += "0";

  // Thousands separators on the whole part.
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${grouped}.${frac}`;
}

/** Format a raw token amount (bigint + its decimals) for display. */
export function formatTokenAmount(raw: bigint, decimals: number): string {
  return formatDecimalAmount(formatUnits(raw, decimals));
}

/**
 * Format an amount to exactly 2 decimal places (rounded, with thousands
 * separators), e.g. "49.95". Used for the USDT-equivalent line on the
 * balance card ("≈ $49.95"). Display-only, like formatDecimalAmount.
 */
export function formatTwoDecimals(value: string): string {
  const s = value.trim();
  if (s === "" || s === "-" || Number.isNaN(Number(s))) return "0.00";
  let neg = false;
  let rest = s;
  if (rest.startsWith("-")) {
    neg = true;
    rest = rest.slice(1);
  }
  const [wholeRaw = "0", fracRaw = ""] = rest.split(".");
  let whole = wholeRaw.replace(/^0+(?=\d)/, "") || "0";
  let frac = fracRaw;

  // Round the fraction to 2 places.
  if (frac.length > 2) {
    const keep = frac.slice(0, 2);
    const nextDigit = frac.charCodeAt(2) - 48;
    if (nextDigit >= 5) {
      const n = BigInt(keep || "0") + 1n;
      if (n >= 100n) {
        whole = (BigInt(whole) + 1n).toString();
        frac = "00";
      } else {
        frac = n.toString().padStart(2, "0");
      }
    } else {
      frac = keep;
    }
  }

  // Pad to exactly 2 places.
  while (frac.length < 2) frac += "0";

  // Thousands separators on the whole part.
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${grouped}.${frac}`;
}
