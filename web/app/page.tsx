"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BottomNav } from "@/components/BottomNav";
import { WalletBalances } from "@/components/WalletBalances";
import { RecentPayments } from "@/components/RecentPayments";
import { GITHUB_REPO } from "@/lib/config";
import Link from "next/link";

/**
 * Home is the wallet itself: balances, send, activity, trust strip.
 * MiniPay-style: green balance card, Send / Receive actions beneath it,
 * then recent activity. Send lives on its own screen (/send). No
 * marketing sections — How it works lives on its own page. Activity is a
 * preview of the same on-chain history the History page shows.
 */
export default function Home() {
  const [showReceive, setShowReceive] = useState(false);
  const [copied, setCopied] = useState(false);
  const { address, isConnected } = useAccount();

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
          <Link
            href="/send"
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
          </Link>
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

        <div className="mt-8">
          <RecentPayments />
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

      {/* Receive is a bottom sheet, same language as the coin picker:
          backdrop, white sheet with rounded top corners, drag handle,
          close affordance, sliding up from the bottom. */}
      {showReceive && (
        <div
          className="fixed inset-0 z-50"
          role="dialog"
          aria-modal="true"
          aria-label="Receive on Celo"
        >
          <button
            type="button"
            aria-label="Close receive"
            onClick={() => setShowReceive(false)}
            className="absolute inset-0 cursor-default bg-black/50"
          />
          <div className="animate-slide-up absolute inset-x-0 bottom-0 mx-auto w-full max-w-lg rounded-t-3xl bg-white p-4 pb-6 shadow-2xl">
            <div className="mx-auto h-1.5 w-10 rounded-full bg-slate-200" />
            <div className="mt-3 flex items-center justify-between px-1">
              <h2 className="text-base font-bold text-slate-800">
                Receive on Celo
              </h2>
              <button
                type="button"
                onClick={() => setShowReceive(false)}
                aria-label="Close"
                className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100"
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
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
            <div className="px-1 pb-1 pt-2">
              {isConnected && address ? (
                <>
                  <p className="text-xs text-slate-500">
                    Share this address to receive stablecoins on Celo mainnet.
                  </p>
                  <p className="mt-3 break-all font-mono text-sm font-medium text-slate-800">
                    {address}
                  </p>
                  <button
                    type="button"
                    onClick={() => void copyAddress()}
                    className="mt-4 rounded-full bg-green-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-green-700"
                  >
                    {copied ? "Copied ✓" : "Copy address"}
                  </button>
                </>
              ) : (
                <p className="text-sm text-slate-500">
                  Connect your wallet above to see your receive address.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <Footer />
      <BottomNav />
    </div>
  );
}
