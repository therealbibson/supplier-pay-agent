"use client";

import { useEffect } from "react";
import type { TOKENS } from "@/lib/config";
import { formatTokenAmount } from "@/lib/format";

export type CoinKey =
  | "USD_T"
  | "cNGN"
  | "IDRX"
  | "wBRL"
  | "wARS"
  | "wMXN"
  | "wCOP"
  | "CELO";

export interface CoinDef {
  key: CoinKey;
  symbol: string;
  /** Full name shown in the picker. */
  name: string;
  /** Real logo image, served from /public/coins. */
  logo: string;
  /** Currency symbol shown before amounts, e.g. "$" for USD₮, "₦" for
      cNGN. Empty when the coin has no currency symbol (CELO). */
  prefix: string;
  /** ERC-20 address key; absent for native CELO. */
  token?: keyof typeof TOKENS;
}

export const COINS: CoinDef[] = [
  { key: "USD_T", symbol: "USD₮", name: "Tether USD", logo: "/coins/usdt.png", prefix: "$", token: "USD_T" },
  { key: "cNGN", symbol: "cNGN", name: "Nigerian Naira", logo: "/coins/cngn.png", prefix: "₦", token: "cNGN" },
  { key: "IDRX", symbol: "IDRX", name: "Indonesian Rupiah", logo: "/coins/idrx.png", prefix: "Rp", token: "IDRX" },
  { key: "wBRL", symbol: "wBRL", name: "Brazilian Real", logo: "/coins/wbrl.png", prefix: "R$", token: "wBRL" },
  { key: "wARS", symbol: "wARS", name: "Argentine Peso", logo: "/coins/wars.png", prefix: "$", token: "wARS" },
  { key: "wMXN", symbol: "wMXN", name: "Mexican Peso", logo: "/coins/wmxn.png", prefix: "$", token: "wMXN" },
  { key: "wCOP", symbol: "wCOP", name: "Colombian Peso", logo: "/coins/wcop.png", prefix: "$", token: "wCOP" },
  { key: "CELO", symbol: "CELO", name: "Celo", logo: "/coins/celo.png", prefix: "" },
];

/**
 * The stablecoins that can be sent. CELO is deliberately excluded:
 * Textile has no CELO corridor on Celo mainnet (its preview answers
 * `corridor_unavailable` for CELO pairs), so there is no quote — and
 * no native-token approval path — to sell it through.
 */
export const SENDABLE_COINS: CoinDef[] = COINS.filter((c) => c.key !== "CELO");

function CheckIcon() {
  return (
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
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

/** A coin's real logo image, clipped to a circle. */
export function CoinIcon({ coin, size = 36 }: { coin: CoinDef; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="block shrink-0 overflow-hidden rounded-full bg-white"
      style={{ width: size, height: size }}
    >
      <img
        src={coin.logo}
        alt=""
        width={size}
        height={size}
        className="h-full w-full object-cover"
      />
    </span>
  );
}

export interface CoinPickerProps {
  /** Whether the sheet is open. */
  open: boolean;
  onClose: () => void;
  /** Coins to offer — the caller filters (e.g. send list excludes CELO,
      receive list excludes the selected send coin). */
  coins: CoinDef[];
  selectedKey: CoinKey;
  onSelect: (key: CoinKey) => void;
  /** Wallet balances for the listed coins, when known. */
  balances?: Partial<Record<CoinKey, bigint | null>>;
  /** On-chain decimals for the listed coins, when known. */
  decimals?: Partial<Record<CoinKey, number>>;
  /** Mask every amount as •••••• (hide-balances mode). */
  hidden?: boolean;
  title?: string;
  /** Extra classes for the sheet (e.g. the caller's font, so the picker
      matches the surface that opened it). */
  className?: string;
}

/**
 * MiniPay-style currency picker: a white bottom sheet with rounded top
 * corners, one row per coin with its real logo, name and balance, the
 * selected coin marked. Backdrop, X, or Escape dismisses it without
 * changing anything; body scroll is locked while it is open.
 */
export function CoinPicker({
  open,
  onClose,
  coins,
  selectedKey,
  onSelect,
  balances,
  decimals,
  hidden = false,
  title = "Select currency",
  className,
}: CoinPickerProps) {
  // Escape closes the picker; lock body scroll while it is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="Close currency picker"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/50"
      />
      <div
        className={`absolute inset-x-0 bottom-0 mx-auto w-full max-w-lg animate-slide-up rounded-t-3xl bg-white p-4 pb-6 shadow-2xl ${className ?? ""}`}
      >
        <div className="mx-auto h-1.5 w-10 rounded-full bg-slate-200" />
        <div className="mt-3 flex items-center justify-between px-1">
          <h2 className="text-base font-bold text-slate-800">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100"
          >
            <CloseIcon />
          </button>
        </div>
        <ul className="mt-2 divide-y divide-slate-100">
          {coins.map((c) => {
            const isSelected = c.key === selectedKey;
            const bal = balances?.[c.key] ?? null;
            const dec = decimals?.[c.key];
            return (
              <li key={c.key}>
                <button
                  type="button"
                  onClick={() => onSelect(c.key)}
                  aria-current={isSelected}
                  className={`flex w-full items-center gap-3 rounded-2xl px-2 py-3 text-left transition ${
                    isSelected ? "bg-green-50" : "hover:bg-slate-50"
                  }`}
                >
                  <CoinIcon coin={c} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-800">
                      {c.symbol}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {c.name}
                    </span>
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-slate-700">
                    {hidden
                      ? "••••••"
                      : bal === null || bal === undefined || dec === undefined
                        ? "—"
                        : `${c.prefix}${formatTokenAmount(bal, dec)}`}
                  </span>
                  {isSelected && (
                    <span className="text-green-600">
                      <CheckIcon />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
