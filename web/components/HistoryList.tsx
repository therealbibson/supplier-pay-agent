"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CELOSCAN } from "@/lib/config";
import { formatDecimalAmount } from "@/lib/format";
import {
  fetchHistory,
  type HistoryCursors,
  type HistoryEntry,
} from "@/lib/history";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

const TYPE_LABELS: Record<HistoryEntry["type"], string> = {
  swap: "Swap via PayBridge",
  payout: "Payment sent",
  approval: "Token approval",
  sent: "Sent",
  received: "Received",
  other: "Contract interaction",
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString([], {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function HistoryRow({ e, wallet }: { e: HistoryEntry; wallet: string }) {
  const other =
    e.from.toLowerCase() === wallet.toLowerCase() ? e.to : e.from;
  const direction =
    e.type === "received"
      ? `From ${shortAddress(other)}`
      : e.type === "sent" || e.type === "payout"
        ? `To ${shortAddress(other)}`
        : e.type === "swap"
          ? "Textile FX swap"
          : e.type === "approval"
            ? e.tokenAddress
              ? `Token ${shortAddress(e.tokenAddress)}`
              : "Token approval"
            : e.to
              ? `To ${shortAddress(e.to)}`
              : "Contract call";
  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-baseline justify-between gap-4">
        <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-800">
          {TYPE_LABELS[e.type]}
          {e.paybridge && (
            <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">
              PayBridge
            </span>
          )}
          {e.status === "error" && (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
              Failed
            </span>
          )}
        </p>
        <p className="shrink-0 text-xs text-slate-400">
          {formatWhen(e.timestamp)}
        </p>
      </div>
      <p className="mt-1 text-sm font-semibold text-slate-800">
        {e.amount !== null
          ? `${
              // Fungible amounts are shown with 2–4 decimal places; NFT
              // amounts are token IDs, so they are left exactly as-is.
              e.isNft ? e.amount : formatDecimalAmount(e.amount)
            } ${e.tokenSymbol ?? ""}`.trim()
          : e.isNft
            ? `${e.tokenSymbol ?? "NFT"} NFT`
            : e.type === "approval"
              ? "Approve token spend"
              : "—"}
      </p>
      <p className="mt-0.5 font-mono text-xs text-slate-500">{direction}</p>
      <a
        href={`${CELOSCAN}/tx/${e.hash}`}
        target="_blank"
        rel="noopener"
        className="mt-2 inline-block font-mono text-xs font-medium text-green-700 hover:underline"
      >
        {e.hash.slice(0, 10)}…{e.hash.slice(-6)} ↗
      </a>
    </li>
  );
}

/**
 * Live on-chain history for a wallet, from Blockscout via our API route.
 * Handles loading, empty, error + retry, refresh, and load-more paging.
 * In preview mode it shows the latest few entries only.
 */
export function HistoryList({
  address,
  preview = false,
  refreshTick = 0,
}: {
  address?: string;
  preview?: boolean;
  refreshTick?: number;
}) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [cursors, setCursors] = useState<HistoryCursors | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (cursor?: HistoryCursors | null, append = false) => {
      if (!address) return;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const page = await fetchHistory(address, cursor);
        setEntries((prev) => (append ? [...prev, ...page.entries] : page.entries));
        setCursors({
          txCursor: page.next_tx_cursor,
          ttCursor: page.next_tt_cursor,
        });
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not load history.",
        );
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [address],
  );

  useEffect(() => {
    if (!address) {
      setEntries([]);
      setCursors(null);
      setError(null);
      return;
    }
    void load();
  }, [address, load, refreshTick]);

  if (!address) {
    return (
      <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
        Connect your wallet to see your history.
      </p>
    );
  }

  if (loading) {
    return (
      <ul className="space-y-2" aria-label="Loading history">
        {[0, 1, 2].map((i) => (
          <li
            key={i}
            className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4"
          >
            <div className="h-4 w-2/3 rounded bg-slate-100" />
            <div className="mt-2 h-4 w-1/3 rounded bg-slate-100" />
          </li>
        ))}
      </ul>
    );
  }

  if (error && entries.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
        <p className="font-semibold text-slate-800">
          Couldn&apos;t load history
        </p>
        <p className="mt-1">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 rounded-full bg-green-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-green-700"
        >
          Try again
        </button>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
        No transactions yet. When you send, swap or receive anything with
        this wallet, it will show up here.
      </p>
    );
  }

  const shown = preview ? entries.slice(0, 3) : entries;

  return (
    <div>
      <ul className="space-y-2">
        {shown.map((e) => (
          <HistoryRow key={e.id} e={e} wallet={address} />
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          ↻ Refresh
        </button>
        {!preview && (cursors?.txCursor || cursors?.ttCursor) && (
          <button
            type="button"
            onClick={() => void load(cursors, true)}
            disabled={loadingMore}
            className="rounded-full bg-green-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-green-700 disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        )}
        {preview && (
          <Link
            href="/history"
            className="rounded-full bg-green-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-green-700"
          >
            View all history →
          </Link>
        )}
      </div>
      {error && entries.length > 0 && (
        <p className="mt-3 text-xs text-amber-700">
          Refresh failed: {error} — showing what loaded so far.
        </p>
      )}
    </div>
  );
}
