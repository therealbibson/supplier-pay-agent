"use client";

import Link from "next/link";
import { ConnectWallet } from "@/components/ConnectWallet";

/**
 * Slim top header: logo + connect button only. Navigation lives in the
 * fixed bottom tab bar (BottomNav).
 */
export function Header() {
  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-lg items-center justify-between gap-2 px-4 py-3">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <img
            src="/logo.png"
            alt="PayBridge logo"
            width={32}
            height={32}
            className="block h-8 w-8 rounded-full"
          />
          <span className="text-lg font-extrabold tracking-tight">
            PayBridge<span className="text-green-600">.</span>
          </span>
        </Link>
        <ConnectWallet />
      </div>
    </header>
  );
}
