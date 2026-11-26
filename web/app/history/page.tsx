"use client";

import { useAccount } from "wagmi";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BottomNav } from "@/components/BottomNav";
import { HistoryList } from "@/components/HistoryList";

/**
 * History — the connected wallet's real on-chain history, synced live
 * from Celo via Blockscout. Not a placeholder: every entry comes from
 * the chain, with a Celoscan link.
 */
export default function HistoryPage() {
  const { address } = useAccount();
  return (
    <div className="min-h-screen bg-white text-slate-800">
      <Header />

      <main className="mx-auto max-w-lg px-4 pb-10 pt-6">
        <h1 className="text-2xl font-extrabold tracking-tight">History</h1>
        <p className="mt-1 text-sm text-slate-500">
          Live from Celo — every transaction for your connected wallet,
          newest first. PayBridge swaps and payouts are marked.
        </p>
        <div className="mt-5">
          <HistoryList address={address} />
        </div>
      </main>

      <Footer />
      <BottomNav />
    </div>
  );
}
