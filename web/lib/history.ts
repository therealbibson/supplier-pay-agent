export interface HistoryEntry {
  id: string;
  hash: string;
  timestamp: string;
  type: "swap" | "payout" | "approval" | "sent" | "received" | "other";
  paybridge: boolean;
  tokenSymbol: string | null;
  tokenAddress: string | null;
  amount: string | null;
  isNft: boolean;
  from: string;
  to: string;
  status: "ok" | "error";
}

export interface HistoryCursors {
  /** Per source: undefined = first page, a string = continue, null = exhausted. */
  txCursor?: string | null;
  ttCursor?: string | null;
}

export interface HistoryPage {
  entries: HistoryEntry[];
  next_tx_cursor: string | null;
  next_tt_cursor: string | null;
}

/**
 * Fetch one page of on-chain history for a wallet, via our API route.
 * Paging is cursor-based per source (transactions + token-transfers);
 * pass the cursors from the previous page to load more.
 */
export async function fetchHistory(
  address: string,
  cursors?: HistoryCursors | null,
): Promise<HistoryPage> {
  const qs = new URLSearchParams({ address });
  if (cursors) {
    if (typeof cursors.txCursor === "string") qs.set("tx_cursor", cursors.txCursor);
    else if (cursors.txCursor === null) qs.set("tx_done", "1");
    if (typeof cursors.ttCursor === "string") qs.set("tt_cursor", cursors.ttCursor);
    else if (cursors.ttCursor === null) qs.set("tt_done", "1");
  }
  const res = await fetch(`/api/history?${qs}`, {
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await res.json().catch(() => ({}))) as Partial<HistoryPage> & {
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? `History failed: ${res.status}`);
  return {
    entries: json.entries ?? [],
    next_tx_cursor: json.next_tx_cursor ?? null,
    next_tt_cursor: json.next_tt_cursor ?? null,
  };
}
