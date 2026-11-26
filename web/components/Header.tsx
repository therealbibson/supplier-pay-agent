"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectWallet } from "@/components/ConnectWallet";

const TABS = [
  { href: "/", label: "Wallet" },
  { href: "/history", label: "History" },
  { href: "/how-it-works", label: "How it works" },
] as const;

export function Header() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-lg items-center justify-between gap-2 px-4 pt-3">
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
      <nav className="mx-auto flex max-w-lg gap-1 px-4 pb-3 pt-2">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`flex-1 rounded-full py-2 text-center text-sm font-medium transition ${
              pathname === t.href
                ? "bg-green-50 font-semibold text-green-700"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-800"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
