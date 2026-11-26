"use client";

import { useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { WalletBalances } from "@/components/WalletBalances";
import { PayFlow } from "@/components/PayFlow";
import { RecentPayments } from "@/components/RecentPayments";
import { GITHUB_REPO } from "@/lib/config";

/**
 * Home is the wallet itself: balances, send, activity, trust strip.
 * No marketing sections — How it works lives on its own page.
 * Activity is a preview of the same on-chain history the History page
 * shows; a completed payment just nudges it to refresh.
 */
export default function Home() {
  const [historyTick, setHistoryTick] = useState(0);

  return (
    <div className="min-h-screen bg-white text-slate-800">
      <Header />

      <main className="mx-auto max-w-lg px-4 pb-16 pt-6">
        <WalletBalances />

        <div className="mt-4">
          <PayFlow onPaymentDone={() => setHistoryTick((t) => t + 1)} />
        </div>

        <div className="mt-8">
          <RecentPayments refreshTick={historyTick} />
        </div>

        <section className="mt-8 rounded-2xl border border-green-600 bg-green-50 p-5">
          <p className="text-sm font-bold text-slate-800">
            ✓ Non-custodial — your keys never leave your wallet
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            PayBridge can&apos;t move your funds. Every step — the approval,
            the swap, the payout — asks you to approve it in your wallet
            first. Connecting only shares your public address.
          </p>
          <a
            href={`https://github.com/${GITHUB_REPO}`}
            target="_blank"
            rel="noopener"
            className="mt-3 inline-block text-sm font-semibold text-green-700 hover:underline"
          >
            Check the code on GitHub ↗
          </a>
        </section>
      </main>

      <Footer />
    </div>
  );
}
