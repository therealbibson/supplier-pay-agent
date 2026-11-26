"use client";

import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { CELOSCAN, TOKENS } from "@/lib/config";
import { tokenBalance } from "@/lib/execute";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Wallet balance card — the top of a normal wallet home screen.
 * USD₮ is the money you spend, shown large; CELO (gas) and cNGN sit
 * beneath. Balances are read on-chain from your connected wallet.
 */
export function WalletBalances() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const [usdt, setUsdt] = useState<bigint | null>(null);
  const [celo, setCelo] = useState<bigint | null>(null);
  const [cngn, setCngn] = useState<bigint | null>(null);

  useEffect(() => {
    if (!publicClient || !address) {
      setUsdt(null);
      setCelo(null);
      setCngn(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [u, c, n] = await Promise.all([
          tokenBalance(publicClient, TOKENS.USD_T, address),
          publicClient.getBalance({ address }),
          tokenBalance(publicClient, TOKENS.cNGN, address),
        ]);
        if (!cancelled) {
          setUsdt(u);
          setCelo(c);
          setCngn(n);
        }
      } catch {
        // Balances are a display convenience; the pay flow re-checks.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicClient, address]);

  return (
    <section className="rounded-2xl bg-green-600 p-6 text-white shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-widest text-green-100">
        Your wallet
      </p>
      {isConnected && address ? (
        <>
          <p className="mt-1 font-mono text-xs text-green-100">
            {shortAddress(address)}
          </p>
          <p className="mt-4 text-4xl font-extrabold tracking-tight">
            {usdt === null
              ? "—"
              : `${formatUnits(usdt, 6)} USD₮`}
          </p>
          <div className="mt-4 space-y-1 border-t border-green-500 pt-4 text-sm">
            <p className="flex justify-between gap-4">
              <span className="text-green-100">CELO · for gas</span>
              <span className="font-semibold">
                {celo === null ? "—" : formatUnits(celo, 18)}
              </span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-green-100">cNGN</span>
              <span className="font-semibold">
                {cngn === null ? "—" : formatUnits(cngn, 6)}
              </span>
            </p>
          </div>
          {celo !== null && celo === 0n && (
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
