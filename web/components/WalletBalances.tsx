"use client";

import { useEffect, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { CELOSCAN, TOKENS } from "@/lib/config";
import { tokenBalance, tokenDecimals } from "@/lib/execute";
import { formatTokenAmount } from "@/lib/format";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

type BalanceCoin =
  | "USD_T"
  | "cNGN"
  | "IDRX"
  | "wBRL"
  | "wARS"
  | "wMXN"
  | "wCOP"
  | "CELO";

interface CoinDef {
  key: BalanceCoin;
  symbol: string;
  /** Full name shown in the picker. */
  name: string;
  /** Colour of the coin icon in the picker. */
  colour: string;
  /** ERC-20 address; absent for native CELO. */
  token?: keyof typeof TOKENS;
}

const COINS: CoinDef[] = [
  { key: "USD_T", symbol: "USD₮", name: "Tether USD", colour: "#16a34a", token: "USD_T" },
  { key: "cNGN", symbol: "cNGN", name: "Nigerian Naira", colour: "#008751", token: "cNGN" },
  { key: "IDRX", symbol: "IDRX", name: "Indonesian Rupiah", colour: "#dc2626", token: "IDRX" },
  { key: "wBRL", symbol: "wBRL", name: "Brazilian Real", colour: "#ca8a04", token: "wBRL" },
  { key: "wARS", symbol: "wARS", name: "Argentine Peso", colour: "#0ea5e9", token: "wARS" },
  { key: "wMXN", symbol: "wMXN", name: "Mexican Peso", colour: "#65a30d", token: "wMXN" },
  { key: "wCOP", symbol: "wCOP", name: "Colombian Peso", colour: "#f59e0b", token: "wCOP" },
  { key: "CELO", symbol: "CELO", name: "Celo", colour: "#35d07f" },
];

/**
 * Display-only preferences, stored in localStorage so they stick across
 * visits. They reveal nothing sensitive — just whether amounts are masked
 * and which coin is shown big.
 */
const HIDE_KEY = "paybridge.hideBalances";
const COIN_KEY = "paybridge.balanceCoin";

function ChevronDownIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

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

/** Small coloured coin icon: a circle with the symbol's first letter. */
function CoinIcon({ coin, size = 36 }: { coin: CoinDef; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ backgroundColor: coin.colour, width: size, height: size, fontSize: size * 0.42 }}
    >
      {coin.symbol.charAt(0)}
    </span>
  );
}

/**
 * Wallet balance card — the top of a normal wallet home screen, in the
 * MiniPay style: a green card, one coin shown big, and the currency
 * picked from a bottom sheet.
 *
 * - Coin picker: the selected coin is a button (icon + symbol + chevron).
 *   Tapping it opens a bottom sheet listing all eight coins with their
 *   balances; tapping a coin selects it and closes the sheet. The choice
 *   persists in localStorage. No native <select> anywhere.
 * - Hide/show: there is no eye icon — tapping the big balance number
 *   itself toggles between the amount and "••••••", with a small hint
 *   underneath so the action is discoverable. The choice persists in
 *   localStorage, and the gas warning stays hidden while masked.
 * - Only the selected coin's balance is shown on the card — no other
 *   coin's balance is listed.
 * - Amounts are shown with 2–4 decimal places (see lib/format.ts).
 * - Gated on connection: before the user connects, the card shows only
 *   "Connect your wallet above to see your balances" — no address, no
 *   balance, and no chain call is made.
 */
export function WalletBalances() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const [hidden, setHidden] = useState(false);
  const [coin, setCoin] = useState<BalanceCoin>("USD_T");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [balances, setBalances] =
    useState<Partial<Record<BalanceCoin, bigint | null>>>({});
  const [decimals, setDecimals] =
    useState<Partial<Record<BalanceCoin, number>>>({});

  // Load display preferences on the client (defaults render on the server,
  // so there is no hydration mismatch).
  useEffect(() => {
    try {
      if (window.localStorage.getItem(HIDE_KEY) === "1") setHidden(true);
      const c = window.localStorage.getItem(COIN_KEY);
      if (c && COINS.some((x) => x.key === c)) setCoin(c as BalanceCoin);
    } catch {
      // Storage unavailable (private mode, etc.) — defaults stand.
    }
  }, []);

  function toggleHidden() {
    const next = !hidden;
    setHidden(next);
    try {
      window.localStorage.setItem(HIDE_KEY, next ? "1" : "0");
    } catch {
      // Ignore storage failures.
    }
  }

  function selectCoin(c: BalanceCoin) {
    setCoin(c);
    try {
      window.localStorage.setItem(COIN_KEY, c);
    } catch {
      // Ignore storage failures.
    }
  }

  // Escape closes the picker; lock body scroll while it is open.
  useEffect(() => {
    if (!pickerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPickerOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [pickerOpen]);

  // Balances + decimals, read on-chain from the connected wallet.
  // Gated on address: nothing is fetched before the user connects.
  useEffect(() => {
    if (!publicClient || !address) {
      setBalances({});
      setDecimals({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const tokenCoins = COINS.filter(
          (c): c is CoinDef & { token: keyof typeof TOKENS } => !!c.token,
        );
        const [decList, balList, celoBal] = await Promise.all([
          Promise.all(
            tokenCoins.map((c) =>
              tokenDecimals(publicClient, TOKENS[c.token]).catch(() => null),
            ),
          ),
          Promise.all(
            tokenCoins.map((c) =>
              tokenBalance(publicClient, TOKENS[c.token], address).catch(
                () => null,
              ),
            ),
          ),
          publicClient.getBalance({ address }).catch(() => null),
        ]);
        if (cancelled) return;
        const d: Partial<Record<BalanceCoin, number>> = { CELO: 18 };
        const b: Partial<Record<BalanceCoin, bigint | null>> = {
          CELO: celoBal,
        };
        tokenCoins.forEach((c, i) => {
          if (decList[i] !== null) d[c.key] = decList[i] as number;
          b[c.key] = balList[i];
        });
        setDecimals(d);
        setBalances(b);
      } catch {
        // Balances are a display convenience; the pay flow re-checks.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicClient, address]);

  const selected = COINS.find((c) => c.key === coin) ?? COINS[0];
  const selectedBalance = balances[coin] ?? null;
  const selectedDecimals = decimals[coin];
  const celoBalance = balances.CELO ?? null;

  function formatAmount(
    value: bigint | null,
    dec: number | undefined,
    symbol: string,
  ): string {
    if (hidden) return `•••••• ${symbol}`;
    if (value === null || value === undefined || dec === undefined)
      return `— ${symbol}`;
    return `${formatTokenAmount(value, dec)} ${symbol}`;
  }

  return (
    <>
      <section className="rounded-3xl bg-green-600 p-6 text-white shadow-md">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-green-100">
            Total
          </p>
          {isConnected && address && (
            <p className="mt-1 font-mono text-xs text-green-100">
              {shortAddress(address)}
            </p>
          )}
        </div>

        {isConnected && address ? (
          <>
            {/* Coin picker button — opens the bottom sheet. Separate tap
                target from the balance below; it never toggles hide/show. */}
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={pickerOpen}
              aria-label={`Balance currency: ${selected.symbol}. Tap to change currency.`}
              className="mt-4 flex items-center gap-2 rounded-full bg-green-700 py-1.5 pl-1.5 pr-3 text-sm font-semibold text-white transition hover:bg-green-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <CoinIcon coin={selected} size={28} />
              <span>{selected.symbol}</span>
              <span className="text-green-200">
                <ChevronDownIcon />
              </span>
            </button>

            {/* The balance itself is the hide/show toggle — no eye icon. */}
            <button
              type="button"
              onClick={toggleHidden}
              aria-label={
                hidden
                  ? `Balance hidden. Tap to show ${selected.symbol} balance.`
                  : `Balance ${formatAmount(selectedBalance, selectedDecimals, selected.symbol)}. Tap to hide balance.`
              }
              title={hidden ? "Tap to show balance" : "Tap to hide balance"}
              className="mt-3 block cursor-pointer rounded-lg text-left text-4xl font-extrabold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            >
              {formatAmount(selectedBalance, selectedDecimals, selected.symbol)}
            </button>
            <p className="mt-1 text-xs text-green-200">
              {hidden ? "Tap balance to show" : "Tap balance to hide"}
            </p>

            {!hidden && celoBalance !== null && celoBalance === 0n && (
              <p className="mt-3 rounded-xl bg-green-700 px-3 py-2 text-xs text-green-50">
                Your CELO balance is 0 — you need a little CELO to pay for gas
                before you can send anything.
              </p>
            )}
            <a
              href={`${CELOSCAN}/address/${address}`}
              target="_blank"
              rel="noopener"
              className="mt-4 inline-block text-xs font-semibold text-green-100 underline hover:text-white"
            >
              View wallet on Celoscan ↗
            </a>
          </>
        ) : (
          <p className="mt-4 text-sm text-green-50">
            Connect your wallet above to see your balances.
          </p>
        )}
      </section>

      {/* MiniPay-style currency picker: white bottom sheet with rounded
          top corners, one row per coin. */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-50"
          role="dialog"
          aria-modal="true"
          aria-label="Select currency"
        >
          <button
            type="button"
            aria-label="Close currency picker"
            onClick={() => setPickerOpen(false)}
            className="absolute inset-0 cursor-default bg-black/50"
          />
          <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-lg rounded-t-3xl bg-white p-4 pb-6 shadow-2xl">
            <div className="mx-auto h-1.5 w-10 rounded-full bg-slate-200" />
            <div className="mt-3 flex items-center justify-between px-1">
              <h2 className="text-base font-bold text-slate-800">
                Select currency
              </h2>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                aria-label="Close"
                className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100"
              >
                <CloseIcon />
              </button>
            </div>
            <ul className="mt-2 divide-y divide-slate-100">
              {COINS.map((c) => {
                const isSelected = c.key === coin;
                const bal = balances[c.key] ?? null;
                const dec = decimals[c.key];
                return (
                  <li key={c.key}>
                    <button
                      type="button"
                      onClick={() => {
                        selectCoin(c.key);
                        setPickerOpen(false);
                      }}
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
                      <span className="text-sm font-semibold text-slate-700">
                        {hidden
                          ? "••••••"
                          : bal === null || bal === undefined || dec === undefined
                            ? "—"
                            : formatTokenAmount(bal, dec)}
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
      )}
    </>
  );
}
