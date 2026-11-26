"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BottomNav } from "@/components/BottomNav";
import { WalletBalances } from "@/components/WalletBalances";
import { PayFlow } from "@/components/PayFlow";
import { RecentPayments } from "@/components/RecentPayments";
import { GITHUB_REPO } from "@/lib/config";

/**
 * Home is the wallet itself: balances, send, activity, trust strip.
 * MiniPay-style: green balance card, Send / Receive actions beneath it,
 * then the send form and recent activity. No marketing sections — How it
 * works lives on its own page. Activity is a preview of the same on-chain
 * history the History page shows; a completed payment just nudges it to
 * refresh.
 */
export default function Home() {
  const [historyTick, setHistoryTick] = useState(0);
  const [showReceive, setShowReceive] = useState(false);
  const [copied, setCopied] = useState(false);
  const { address, isConnected } = useAccount();

  function scrollToSend() {
    document
      .getElementById("send-payment")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    // Focus the amount input if the form is usable.
    window.setTimeout(() => {
      const input = document.getElementById("amount") as HTMLInputElement | null;
      if (input && !input.disabled) input.focus({ preventScroll: true });
    }, 450);
  }

  async function copyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the address is still shown to copy by hand.
    }
  }

  return (
    <div className="min-h-screen bg-white text-slate-800">
      <Header />

      <main className="mx-auto max-w-lg px-4 pb-10 pt-6">
        <WalletBalances />

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={scrollToSend}
            className="flex items-center justify-center gap-2 rounded-2xl bg-green-600 px-4 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-green-700"
          >
            <svg
              width={18}
              height={18}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
            Send
          </button>
          <button
            type="button"
            onClick={() => setShowReceive((v) => !v)}
            aria-expanded={showReceive}
            className="flex items-center justify-center gap-2 rounded-2xl border border-green-600 bg-white px-4 py-3.5 text-sm font-bold text-green-700 shadow-sm transition hover:bg-green-50"
          >
            <svg
              width={18}
              height={18}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" transform="rotate(180 12 12)" />
            </svg>
            Receive
          </button>
        </div>

        {showReceive && (
          <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold text-slate-800">
              Receive on Celo
            </p>
            {isConnected && address ? (
              <>
                <p className="mt-1 text-xs text-slate-500">
                  Share this address to receive stablecoins on Celo mainnet.
                </p>
                <p className="mt-3 break-all font-mono text-sm font-medium text-slate-800">
                  {address}
                </p>
                <button
                  type="button"
                  onClick={() => void copyAddress()}
                  className="mt-3 rounded-full bg-green-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-green-700"
                >
                  {copied ? "Copied ✓" : "Copy address"}
                </button>
              </>
            ) : (
              <p className="mt-1 text-sm text-slate-500">
                Connect your wallet above to see your receive address.
              </p>
            )}
          </div>
        )}

        <div id="send-payment" className="mt-4 scroll-mt-24">
          <PayFlow onPaymentDone={() => setHistoryTick((t) => t + 1)} />
        </div>

        <div className="mt-8">
          <RecentPayments refreshTick={historyTick} />
        </div>

        <section className="mt-8 rounded-3xl border border-green-600 bg-green-50 p-5 shadow-sm">
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
      <BottomNav />
    </div>
  );
}
