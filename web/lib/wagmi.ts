import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { CHAIN } from "./config";

/**
 * wagmi config — injected wallet only (MetaMask etc.), Celo mainnet only.
 * drpc is the RPC that proved reliable for the CLI (Forno and Ankr both
 * failed eth_sendRawTransaction from viem).
 */
export const wagmiConfig = createConfig({
  chains: [CHAIN],
  connectors: [injected()],
  transports: {
    [CHAIN.id]: http("https://celo.drpc.org", { timeout: 45_000 }),
  },
});
