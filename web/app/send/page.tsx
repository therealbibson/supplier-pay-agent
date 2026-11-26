"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConnectWallet } from "@/components/ConnectWallet";
import { Footer } from "@/components/Footer";
import { PayFlow } from "@/components/PayFlow";

/**
 * Send is its own screen, MiniPay-style: a back arrow to the wallet and a
 * "Send payment" title. This is a flow screen, so the bottom tab bar is
 * not shown here.
 *
 * Motion: the whole screen slides up from the bottom of the viewport on
 * entry (~300ms, ease-out). Going back — the back arrow or the done
 * panel's "Back to wallet" — slides it back down before leaving.
 */
export default function SendPage() {
  const router = useRouter();
  const [exiting, setExiting] = useState(false);

  function goBack() {
    if (exiting) return;
    setExiting(true);
    window.setTimeout(() => router.push("/"), 300);
  }

  return (
    <div
      className={`min-h-screen bg-white text-slate-800 ${
        exiting ? "animate-slide-down" : "animate-slide-up"
      }`}
    >
      <main className="mx-auto max-w-lg px-4 pb-10 pt-4">
        {/* Title can shrink and truncate so the row always fits at 360px:
            back arrow and Connect button stay intact, nothing is cut off
            on the right. */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={goBack}
              aria-label="Back to wallet"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100"
            >
              <svg
                width={22}
                height={22}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
            </button>
            <h1 className="min-w-0 truncate text-xl font-bold text-slate-800">Send payment</h1>
          </div>
          <div className="shrink-0">
            <ConnectWallet />
          </div>
        </div>

        <div className="mt-4">
          <PayFlow onBackToWallet={goBack} />
        </div>
      </main>

      <Footer />
    </div>
  );
}
