"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { HistoryList } from "@/components/HistoryList";

/**
 * Home-page preview of the same on-chain history the History page shows
 * — latest few entries, linking to the full list. One data source only:
 * the chain, via /api/history. Payments made in this session appear here
 * once they are confirmed on-chain.
 */
export function RecentPayments({ refreshTick = 0 }: { refreshTick?: number }) {
  const { address } = useAccount();
  return (
    <section>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-bold text-slate-800">Recent payments</h2>
        <Link
          href="/history"
          className="text-xs font-semibold text-green-700 hover:underline"
        >
          View all →
        </Link>
      </div>
      <div className="mt-3">
        <HistoryList address={address} preview refreshTick={refreshTick} />
      </div>
    </section>
  );
}
