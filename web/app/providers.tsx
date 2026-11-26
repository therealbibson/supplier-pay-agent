"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi";

/**
 * reconnectOnMount={false} is deliberate and load-bearing.
 *
 * wagmi's default auto-reconnect calls the injected connector's
 * isAuthorized() on every page load, which silently calls eth_accounts
 * on the user's wallet before they have clicked anything. MetaMask /
 * Blockaid's phishing scanner reads silent wallet calls on mount as
 * wallet-drainer behaviour (see the ARCOX DEX false-positive case) and
 * flags the whole domain. With reconnectOnMount={false} the wallet is
 * not touched AT ALL until the user clicks "Connect wallet" — every
 * visit starts disconnected and connecting is always an explicit,
 * user-initiated eth_requestAccounts.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig} reconnectOnMount={false}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
