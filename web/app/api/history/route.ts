import { NextResponse } from "next/server";
import { TEXTILE_REACTOR, TOKENS } from "@/lib/config";

/**
 * GET /api/history?address=0x…&tx_cursor=…&tt_cursor=…
 * Server-side proxy to the Blockscout v2 API for Celo — the browser never
 * calls Blockscout directly. No API key needed (public API).
 *
 * Two Blockscout calls are merged, because neither alone tells the whole
 * story: the transactions list does NOT embed token transfers (that field
 * is null), so token movements come from /token-transfers, while
 * approvals, plain CELO moves and other contract calls come from
 * /transactions. Entries are deduped by transaction hash.
 *
 * PayBridge activity is flagged where the on-chain data shows it: a
 * transfer inside a transaction sent to the Textile reactor (the swap),
 * a payout in a local stablecoin, or an approval whose spender is the
 * reactor. Paging is cursor-based: each source has its own opaque
 * next-page cursor (base64url JSON of Blockscout's next_page_params,
 * whose shape varies — it is forwarded verbatim). A source whose cursor
 * came back null is exhausted: the client sends tx_done=1 / tt_done=1
 * for it so it is not re-fetched from page one.
 */

const BLOCKSCOUT = "https://celo.blockscout.com/api/v2";

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

const REACTOR = TEXTILE_REACTOR.toLowerCase();

const LOCAL_STABLECOIN_ADDRESSES = new Set(
  [TOKENS.cNGN, TOKENS.IDRX, TOKENS.wARS, TOKENS.wBRL, TOKENS.wMXN, TOKENS.wCOP].map(
    (a) => a.toLowerCase(),
  ),
);

function formatAmount(raw: string, decimals: number): string {
  try {
    const v = BigInt(raw);
    const d = BigInt(10) ** BigInt(decimals);
    const whole = v / d;
    const frac = v % d;
    if (frac === 0n) return whole.toString();
    const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
    return `${whole}.${fracStr}`;
  } catch {
    return raw;
  }
}

function encodeCursor(p: unknown): string | null {
  if (!p) return null;
  try {
    return Buffer.from(JSON.stringify(p)).toString("base64url");
  } catch {
    return null;
  }
}

function decodeCursor(s: string | null): Record<string, string> {
  if (!s) return {};
  try {
    const o = JSON.parse(Buffer.from(s, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    return Object.fromEntries(
      Object.entries(o).map(([k, v]) => [k, String(v)]),
    );
  } catch {
    return {};
  }
}

interface BlockscoutTx {
  hash: string;
  status: string;
  timestamp: string;
  from: { hash: string };
  to: { hash: string } | null;
  value: string;
  method?: string | null;
  decoded_input?: {
    method_call?: string;
    parameters?: Array<{ name: string; value: string }>;
  } | null;
}

interface BlockscoutTransfer {
  transaction_hash: string;
  timestamp: string;
  type: string;
  token: {
    address_hash: string;
    symbol: string;
    decimals: string;
    type: string;
  };
  from: { hash: string };
  to: { hash: string };
  total: { value: string | null };
}

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(`Blockscout failed: ${res.status}`);
  return json;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json(
      { error: "A valid wallet address is required." },
      { status: 400 },
    );
  }
  const wallet = address.toLowerCase();
  const txDone = searchParams.get("tx_done") === "1";
  const ttDone = searchParams.get("tt_done") === "1";
  const txQs = new URLSearchParams(decodeCursor(searchParams.get("tx_cursor")));
  const ttQs = new URLSearchParams(decodeCursor(searchParams.get("tt_cursor")));

  try {
    const [txJson, ttJson] = await Promise.all([
      txDone
        ? Promise.resolve({ items: [], next_page_params: null })
        : fetchJson(`${BLOCKSCOUT}/addresses/${address}/transactions?${txQs}`),
      ttDone
        ? Promise.resolve({ items: [], next_page_params: null })
        : fetchJson(`${BLOCKSCOUT}/addresses/${address}/token-transfers?${ttQs}`),
    ]);

    const txs = (txJson.items ?? []) as BlockscoutTx[];
    const transfers = (ttJson.items ?? []) as BlockscoutTransfer[];

    // Parent transaction lookup, for PayBridge detection on transfers.
    const txByHash = new Map<string, BlockscoutTx>();
    for (const tx of txs) txByHash.set(tx.hash.toLowerCase(), tx);

    // Group transfers by transaction.
    const transfersByTx = new Map<string, BlockscoutTransfer[]>();
    for (const t of transfers) {
      const key = (t.transaction_hash ?? "").toLowerCase();
      const list = transfersByTx.get(key) ?? [];
      list.push(t);
      transfersByTx.set(key, list);
    }

    const entries: HistoryEntry[] = [];

    const transferEntry = (
      t: BlockscoutTransfer,
      index: number,
    ): HistoryEntry => {
      const parent = txByHash.get((t.transaction_hash ?? "").toLowerCase());
      const parentToReactor =
        parent?.to?.hash.toLowerCase() === REACTOR;
      const fromWallet = t.from.hash.toLowerCase() === wallet;
      const toWallet = t.to.hash.toLowerCase() === wallet;
      const isLocal = LOCAL_STABLECOIN_ADDRESSES.has(
        t.token.address_hash.toLowerCase(),
      );
      const isNft = t.token.type === "ERC-721" || t.token.type === "ERC-1155";
      const decimals = Number(t.token.decimals ?? 18);
      let type: HistoryEntry["type"] = toWallet ? "received" : "sent";
      let paybridge = false;
      if (parentToReactor) {
        // Inside a swap transaction sent to the Textile reactor.
        paybridge = true;
        if (fromWallet) type = "swap";
        // The swap output arriving back is a "received" with the badge.
      } else if (t.to.hash.toLowerCase() === REACTOR && fromWallet) {
        type = "swap";
        paybridge = true;
      } else if (fromWallet && isLocal) {
        type = "payout";
        paybridge = true;
      }
      return {
        id: `${t.transaction_hash}-${index}`,
        hash: t.transaction_hash,
        timestamp: t.timestamp,
        type,
        paybridge,
        tokenSymbol: t.token.symbol ?? null,
        tokenAddress: t.token.address_hash ?? null,
        amount:
          t.total?.value != null
            ? formatAmount(t.total.value, decimals)
            : null,
        isNft,
        from: t.from.hash,
        to: t.to.hash,
        status: "ok",
      };
    };

    // Transactions first: transfer entries where the tx has transfers,
    // otherwise a single entry for the tx itself.
    for (const tx of txs) {
      const status = tx.status === "ok" ? "ok" : "error";
      const txTransfers = transfersByTx.get(tx.hash.toLowerCase()) ?? [];
      if (txTransfers.length > 0) {
        txTransfers.forEach((t, i) => {
          const e = transferEntry(t, i);
          e.status = status;
          entries.push(e);
        });
        continue;
      }
      const method = (tx.method ?? tx.decoded_input?.method_call ?? "").toLowerCase();
      if (method === "approve") {
        const spenderIsReactor = (tx.decoded_input?.parameters ?? []).some(
          (p) => p.value?.toLowerCase() === REACTOR,
        );
        entries.push({
          id: tx.hash,
          hash: tx.hash,
          timestamp: tx.timestamp,
          type: "approval",
          paybridge: spenderIsReactor,
          tokenSymbol: null,
          tokenAddress: tx.to?.hash ?? null,
          amount: null,
          isNft: false,
          from: tx.from.hash,
          to: tx.to?.hash ?? "",
          status,
        });
        continue;
      }
      if (tx.value) {
        try {
          if (BigInt(tx.value) > 0n) {
            const toWallet = tx.to?.hash.toLowerCase() === wallet;
            entries.push({
              id: tx.hash,
              hash: tx.hash,
              timestamp: tx.timestamp,
              type: toWallet ? "received" : "sent",
              paybridge: false,
              tokenSymbol: "CELO",
              tokenAddress: null,
              amount: formatAmount(tx.value, 18),
              isNft: false,
              from: tx.from.hash,
              to: tx.to?.hash ?? "",
              status,
            });
            continue;
          }
        } catch {
          // Fall through to "other" if the value is unreadable.
        }
      }
      entries.push({
        id: tx.hash,
        hash: tx.hash,
        timestamp: tx.timestamp,
        type: "other",
        paybridge: false,
        tokenSymbol: null,
        tokenAddress: null,
        amount: null,
        isNft: false,
        from: tx.from.hash,
        to: tx.to?.hash ?? "",
        status,
      });
    }

    // Transfers whose parent transaction was not on this tx page (paging
    // drift) — show them too, classified with the fallback heuristics.
    const seenTxHashes = new Set(txs.map((t) => t.hash.toLowerCase()));
    for (const t of transfers) {
      if (seenTxHashes.has((t.transaction_hash ?? "").toLowerCase())) continue;
      entries.push(transferEntry(t, 0));
    }

    // Newest first.
    entries.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));

    return NextResponse.json({
      entries,
      next_tx_cursor: encodeCursor(txJson.next_page_params),
      next_tt_cursor: encodeCursor(ttJson.next_page_params),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not reach Blockscout.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
