"use client";

import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { injected } from "wagmi/connectors";
import { CHAIN } from "@/lib/config";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function ConnectWallet() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  if (!isConnected || !address) {
    return (
      <button
        type="button"
        onClick={() => connect({ connector: injected() })}
        disabled={isPending}
        className="rounded-full bg-green-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-green-700 disabled:opacity-50"
      >
        {isPending ? "Connecting…" : "Connect wallet"}
      </button>
    );
  }

  const wrongChain = chainId !== CHAIN.id;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {wrongChain ? (
        <button
          type="button"
          onClick={() => switchChain({ chainId: CHAIN.id })}
          disabled={isSwitching}
          className="rounded-full bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:opacity-50"
        >
          {isSwitching ? "Switching…" : "Switch to Celo"}
        </button>
      ) : (
        <span className="rounded-full bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700">
          Celo mainnet
        </span>
      )}
      <span className="rounded-full border border-slate-200 px-3 py-1.5 font-mono text-xs font-medium text-slate-700">
        {shortAddress(address)}
      </span>
      <button
        type="button"
        onClick={() => disconnect()}
        className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
      >
        Disconnect
      </button>
    </div>
  );
}
