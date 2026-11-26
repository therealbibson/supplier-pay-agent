"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAccount, usePublicClient } from "wagmi";
import { formatUnits } from "viem";
import { CELOSCAN, CHAIN, TOKENS } from "@/lib/config";
import { tokenBalance, tokenDecimals } from "@/lib/execute";
import { formatTokenAmount, formatTwoDecimals } from "@/lib/format";
import { previewQuote } from "@/lib/textile";
import { COINS, CoinIcon, CoinPicker, type CoinDef, type CoinKey } from "./CoinPicker";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

type BalanceCoin = CoinKey;

/**
 * Display-only preferences, stored in localStorage so they stick across
 * visits. They reveal nothing sensitive — just whether amounts are masked
 * and which coin is shown big.
 */
const HIDE_KEY = "paybridge.hideBalances";
const COIN_KEY = "paybridge.balanceCoin";

/**
 * Wallet balance card — rebuilt to look like MiniPay's balance card,
 * grounded in MiniPay's own home-screen image from minipay.xyz
 * (app-screen.webp, downloaded and viewed 26 Nov 2026):
 * - The exact green sampled from that card: #06955e (with soft
 *   lighter-green circles in the background, sampled #1da06f-ish,
 *   rendered as white at low opacity), large rounded corners.
 * - "Total" label, small white regular text at the top left; the big
 *   amount in white, very large and bold, left-aligned under it.
 * - Send / Receive as outline pills INSIDE the card, below the amount,
 *   like MiniPay's Add cash / Withdraw pills: white border,
 *   translucent fill, white circle with a green arrow. Receive
 *   (money in, down arrow) first, Send (money out, up-right arrow)
 *   second, as in MiniPay.
 * - Coin picker: the bottom row of the card (logo + symbol + small
 *   down-chevron) opens the bottom sheet listing all eight coins with
 *   their real logos and balances; tapping a coin selects it and
 *   closes the sheet. The choice persists in localStorage. No native
 *   <select> anywhere.
 * - Hide/show: there is no eye icon — tapping the big balance number
 *   itself toggles between the amount and "••••••", with a small hint
 *   underneath so the action is discoverable. The choice persists in
 *   localStorage, and the gas warning stays hidden while masked. The
 *   balance and the selector row are separate tap targets.
 * - Only the selected coin's balance is shown on the card — no other
 *   coin's balance is listed.
 * - Amounts are shown with 2–4 decimal places (see lib/format.ts),
 *   sign only (e.g. "$10.00", "₦72,214.83") — no trailing currency
 *   code; the selector row shows which coin is selected. Hidden
 *   balance shows sign + dots only (e.g. "₦ ••••••").
 * - Under the big balance, a small not-bold line shows what the
 *   balance is worth in USDT (e.g. "≈ $49.95"), MiniPay-style —
 *   only for a non-USD₮ coin with a real balance and a Textile
 *   preview quote; hidden balances show "≈ ••••••" instead, and a
 *   missing quote shows no line at all.
 * - Type: Inter, loaded self-hosted via next/font/google in
 *   app/layout.tsx (CSS variable --font-inter, wired to --font-sans in
 *   globals.css). MiniPay's exact font family could not be identified
 *   from any public source, so Inter stands in. The card applies it
 *   explicitly via font-sans so the card's type stays Inter even if
 *   the app default ever changes; amounts use tabular figures so
 *   digits line up.
 * - Gated on connection: before the user connects, the card shows a
 *   neutral state — "Total" label, a muted "—" where the balance goes,
 *   and the coin selector row at the bottom — with no instruction text
 *   and no chain call made.
 */
export function WalletBalances({ onReceive }: { onReceive: () => void }) {
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

  // USDT equivalent of the selected coin's balance — the small line
  // under the big balance, MiniPay-style ("≈ $49.95"). Fetched from
  // the app's own Textile preview: sell the full balance of the
  // selected coin for USD₮. Only for a non-USD₮ coin with a real
  // balance; no quote (or an error) means no line at all, never a
  // placeholder, zero, or broken value. A stale reply for an old
  // coin/balance is dropped via the request id.
  const [usdtEquivalent, setUsdtEquivalent] = useState<bigint | null>(null);
  const usdtReqRef = useRef(0);
  const usdtDecimals = decimals["USD_T"];

  useEffect(() => {
    const sellToken = selected.token ? TOKENS[selected.token] : undefined;
    if (
      !isConnected ||
      !address ||
      coin === "USD_T" ||
      !sellToken ||
      selectedBalance === null ||
      selectedBalance === 0n ||
      selectedDecimals === undefined ||
      usdtDecimals === undefined
    ) {
      usdtReqRef.current += 1; // invalidate any in-flight fetch
      setUsdtEquivalent(null);
      return;
    }
    const reqId = ++usdtReqRef.current;
    void (async () => {
      try {
        const p = await previewQuote({
          chainId: CHAIN.id,
          sellToken,
          buyToken: TOKENS.USD_T,
          sellAmount: selectedBalance.toString(),
        });
        if (usdtReqRef.current !== reqId) return; // stale response
        if (!p || BigInt(p.buyAmount) <= 0n) {
          setUsdtEquivalent(null);
          return;
        }
        setUsdtEquivalent(BigInt(p.buyAmount));
      } catch {
        if (usdtReqRef.current !== reqId) return;
        setUsdtEquivalent(null); // no quote, no line — never an error state
      }
    })();
  }, [
    isConnected,
    address,
    coin,
    selectedBalance,
    selectedDecimals,
    usdtDecimals,
  ]);

  function formatAmount(
    value: bigint | null,
    dec: number | undefined,
    symbol: string,
  ): string {
    if (hidden) return `${selected.prefix} ••••••`;
    if (value === null || value === undefined || dec === undefined)
      return "—";
    // Currency sign before the amount only, e.g. "$10.00", "₦72,214.83".
    // No trailing currency code — the selector row at the bottom of the
    // card already shows which coin is selected.
    return `${selected.prefix}${formatTokenAmount(value, dec)}`;
  }

  return (
    <>
      <section className="relative overflow-hidden rounded-[28px] bg-[#06955e] p-6 font-sans text-white shadow-md">
        {/* MiniPay's card has soft lighter-green circles in the
            background — one top-left behind the label, one
            bottom-right. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-20 -top-28 h-64 w-64 rounded-full bg-white/[0.07]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 -right-12 h-56 w-56 rounded-full bg-white/[0.07]"
        />
        <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <p className="text-base font-normal text-white">Total</p>
          {isConnected && address && (
            <a
              href={`${CELOSCAN}/address/${address}`}
              target="_blank"
              rel="noopener"
              className="font-mono text-xs text-white/80 underline hover:text-white"
            >
              {shortAddress(address)} ↗
            </a>
          )}
        </div>

        {isConnected && address ? (
          <>
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
              className="mt-2 block cursor-pointer rounded-lg text-left text-5xl font-bold leading-none tracking-tight tabular-nums focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            >
              {formatAmount(selectedBalance, selectedDecimals, selected.symbol)}
            </button>
            {/* MiniPay-style equivalent value: small, not bold, directly
                under the big balance. Only for a non-USD₮ coin with a
                real balance: hidden balances show the masked line, a
                missing quote shows nothing at all. */}
            {coin !== "USD_T" &&
              selectedBalance !== null &&
              selectedBalance > 0n &&
              (hidden || usdtEquivalent !== null) && (
                <p className="mt-1 text-sm font-normal text-white/80 tabular-nums">
                  {hidden
                    ? "≈ ••••••"
                    : usdtEquivalent !== null && usdtDecimals !== undefined
                      ? `≈ $${formatTwoDecimals(formatUnits(usdtEquivalent, usdtDecimals))}`
                      : null}
                </p>
              )}
            <p className="mt-2 text-xs text-white/70">
              {hidden ? "Tap balance to show" : "Tap balance to hide"}
            </p>

            {!hidden && celoBalance !== null && celoBalance === 0n && (
              <p className="mt-3 rounded-xl bg-[#047857] px-3 py-2 text-xs text-white/90">
                Your CELO balance is 0 — you need a little CELO to pay for gas
                before you can send anything.
              </p>
            )}
          </>
        ) : (
          /* Neutral pre-connect state: a muted dash, no instruction text. */
          <p className="mt-2 text-5xl font-bold leading-none tracking-tight tabular-nums text-white/60">
            —
          </p>
        )}

        {/* Send / Receive — inside the card, like MiniPay's Add cash /
            Withdraw pills: white outline, translucent fill, white
            circle with a green arrow. Receive (money in) first,
            Send (money out) second, as in MiniPay. */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onReceive}
            className="flex items-center justify-center gap-2 rounded-full border border-white/60 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[#06955e]">
              <svg
                width={14}
                height={14}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 5v14" />
                <path d="m19 12-7 7-7-7" />
              </svg>
            </span>
            Receive
          </button>
          <Link
            href="/send"
            className="flex items-center justify-center gap-2 rounded-full border border-white/60 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[#06955e]">
              <svg
                width={14}
                height={14}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M7 17 17 7" />
                <path d="M7 7h10v10" />
              </svg>
            </span>
            Send
          </Link>
        </div>

        {/* Coin selector — a row at the bottom of the card, logo +
            symbol + a small down-chevron, so users can tell it opens a
            dropdown. Tapping it opens the picker sheet. Separate tap
            target from the balance above; it never toggles hide/show.
            Shown whether connected or not, so the card keeps its shape
            before connecting. */}
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={pickerOpen}
          aria-label={`Balance currency: ${selected.symbol}. Tap to change currency.`}
          className="mt-5 flex w-full items-center gap-3 border-t border-white/20 pt-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <CoinIcon coin={selected} size={32} />
          <span className="text-sm font-semibold text-white">
            {selected.symbol}
          </span>
          <svg
            aria-hidden="true"
            className="h-4 w-4 text-white/70"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        </div>
      </section>

      {/* MiniPay-style currency picker (shared with the Send screen). */}
      <CoinPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        coins={COINS}
        selectedKey={coin}
        onSelect={(c) => {
          selectCoin(c);
          setPickerOpen(false);
        }}
        balances={balances}
        decimals={decimals}
        hidden={hidden}
        className="font-sans"
      />
    </>
  );
}
