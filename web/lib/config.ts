import { celo } from "viem/chains";
import type { Address } from "viem";

export const CHAIN = celo; // Celo mainnet, chainId 42220

export const TEXTILE_API = "https://api.textilecredit.com/v2";

export const CELOSCAN = "https://celoscan.io";

/** Token addresses on Celo mainnet (from the hackathon track page). */
export const TOKENS = {
  USD_T: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
  cNGN: "0xF6829D7393dAe24509eb1E52eE8e572e2E271a4f",
  IDRX: "0x18Bc5bcC660cf2B9cE3cd51a404aFe1a0cBD3C22",
  wARS: "0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D",
  wBRL: "0xD76f5Faf6888e24D9F04Bf92a0c8B921FE4390e0",
  wMXN: "0x337E7456B420bD3481e7FA61fA9850343d610d34",
  wCOP: "0x8a1D45e102e886510e891d2Ec656a708991e2D76",
} as const satisfies Record<string, Address>;

/** Textile LimitOrderReactor on Celo mainnet. */
export const TEXTILE_REACTOR =
  "0xa9AA0a64769cBed4d3B1Ceb4Df01CdE915C235b3" as Address;

/**
 * Attribution tag assigned by Loops House at registration.
 * Used VERBATIM — it does not match a repo-slug derivation, so it must
 * never be re-derived. Every transaction the app sends carries this tag.
 */
export const ATTRIBUTION_TAG = "celo_7f040b6e9d4f";

/** Corridors the track accepts: USD₮ <-> local stablecoin. */
export const LOCAL_STABLECOINS = [
  "cNGN",
  "IDRX",
  "wARS",
  "wBRL",
  "wMXN",
  "wCOP",
] as const;
export type LocalStablecoin = (typeof LOCAL_STABLECOINS)[number];

export const LOCAL_STABLECOIN_LABELS: Record<LocalStablecoin, string> = {
  cNGN: "cNGN — Nigerian naira",
  IDRX: "IDRX — Indonesian rupiah",
  wARS: "wARS — Argentine peso",
  wBRL: "wBRL — Brazilian real",
  wMXN: "wMXN — Mexican peso",
  wCOP: "wCOP — Colombian peso",
};

/** The PayBridge agent wallet (CLI) and on-chain identities. */
export const AGENT_WALLET =
  "0x44e04FD0Fb66C395EE81e968E2b9E66AF002A0e6" as Address;
export const ERC8004_AGENT_ID = 10115;
export const SELF_AGENT_ID = 219;
export const GITHUB_REPO = "therealbibson/supplier-pay-agent";
