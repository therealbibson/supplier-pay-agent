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
  /** ERC-20 address; absent for native CELO. */
  token?: keyof typeof TOKENS;
}

const COINS: CoinDef[] = [
  { key: "USD_T", symbol: "USD₮", token: "USD_T" },
  { key: "cNGN", symbol: "cNGN", token: "cNGN" },
  { key: "IDRX", symbol: "IDRX", token: "IDRX" },
  { key: "wBRL", symbol: "wBRL", token: "wBRL" },
  { key: "wARS", symbol: "wARS", token: "wARS" },
  { key: "wMXN", symbol: "wMXN", token: "wMXN" },
  { key: "wCOP", symbol: "wCOP", token: "wCOP" },
  { key: "CELO", symbol: "CELO" },
];

/**
 * Display-only preferences, stored in localStorage so they stick across
 * visits. They reveal nothing sensitive — just whether amounts are masked
 * and which coin is shown big.
 */
const HIDE_KEY = "paybridge.hideBalances";
const COIN_KEY = "paybridge.balanceCoin";

function EyeIcon({ off }: { off?: boolean }) {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {off ? (
        <>
          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
          <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
          <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.59 9.59 0 0 0 5.39-1.61" />
          <line x1="2" y1="2" x2="22" y2="22" />
        </>
      ) : (
        <>
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

/**
 * Wallet balance card — the top of a normal wallet home screen.
 *
 * - Coin selector (dropdown): USD₮, cNGN, IDRX, wBRL, wARS, wMXN, wCOP,
 *   CELO. Only the selected coin's balance is shown, large — no other
 *   coin's balance is listed on the card.
 *   wallet (decimals read on-chain too, never guessed); CELO is the
 *   native balance (18 decimals).
 * - Eye toggle: hides every amount on the card behind "••••••".
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
    <section className="rounded-3xl bg-green-600 p-6 text-white shadow-md">
      <div className="flex items-start justify-between gap-4">
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
        {isConnected && address && (
          <button
            type="button"
            onClick={toggleHidden}
            aria-label={hidden ? "Show balances" : "Hide balances"}
            title={hidden ? "Show balances" : "Hide balances"}
            className="rounded-full bg-green-700 p-2 text-green-100 transition hover:bg-green-800"
          >
            <EyeIcon off={hidden} />
          </button>
        )}
      </div>

      {isConnected && address ? (
        <>
          <div className="mt-4">
            <label
              htmlFor="balance-coin"
              className="text-xs font-semibold text-green-100"
            >
              Balance currency
            </label>
            <select
              id="balance-coin"
              value={coin}
              onChange={(e) => selectCoin(e.target.value as BalanceCoin)}
              className="mt-1 w-full rounded-xl border border-green-500 bg-green-700 px-3 py-2.5 text-sm font-semibold text-white outline-none transition focus:border-white"
            >
              {COINS.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.symbol}
                </option>
              ))}
            </select>
          </div>

          <p className="mt-3 text-4xl font-extrabold tracking-tight">
            {formatAmount(selectedBalance, selectedDecimals, selected.symbol)}
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
  );
}
