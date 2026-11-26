import { withAttribution, verifyTx } from "@celo/attribution-tags";
import {
  encodeFunctionData,
  erc20Abi,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { ATTRIBUTION_TAG, CHAIN, TEXTILE_REACTOR } from "./config";
import type { Quote } from "./textile";

/**
 * On-chain execution, ported from the CLI (../src/swap.ts, payout.ts,
 * attribution.ts). Every transaction goes through the wallet client
 * extended with withAttribution(ATTRIBUTION_TAG), so the Loops House tag
 * is appended to the calldata of the approval, the swap and the payout.
 * Textile's own includeAttribution is left off — our tag is the only one.
 */

/** Wallet client with the attribution tag applied to every transaction. */
export function getTaggedWalletClient(walletClient: WalletClient) {
  return walletClient.extend(withAttribution(ATTRIBUTION_TAG));
}

export type TaggedWalletClient = ReturnType<typeof getTaggedWalletClient>;

/**
 * Approve `required` of the sell token to the Textile reactor, if the
 * standing allowance doesn't already cover it. The approval MUST confirm
 * before the swap is broadcast. USDT-style tokens reject
 * approve(nonzero -> nonzero), so an existing nonzero allowance is reset
 * to zero first.
 */
export async function approveIfNeeded(
  publicClient: PublicClient,
  wallet: TaggedWalletClient,
  sellToken: Address,
  taker: Address,
  required: bigint,
  account: Address,
): Promise<{ resetHash: Hex | null; hash: Hex | null }> {
  const allowance = (await publicClient.readContract({
    address: sellToken,
    abi: erc20Abi,
    functionName: "allowance",
    args: [taker, TEXTILE_REACTOR],
  })) as bigint;
  if (allowance >= required) return { resetHash: null, hash: null };

  let resetHash: Hex | null = null;
  if (allowance > 0n) {
    resetHash = await wallet.sendTransaction({
      account,
      chain: CHAIN,
      to: sellToken,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [TEXTILE_REACTOR, 0n],
      }),
      value: 0n,
    });
    await publicClient.waitForTransactionReceipt({ hash: resetHash });
  }

  const hash = await wallet.sendTransaction({
    account,
    chain: CHAIN,
    to: sellToken,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [TEXTILE_REACTOR, required],
    }),
    value: 0n,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return { resetHash, hash };
}

/**
 * Broadcast the swap exactly as Textile returned it (`transactions.swap`).
 * Never execute the top-level `encodedOrder` / `signature` directly — on
 * a multi-maker quote those are only the first order and you would
 * under-fill.
 */
export async function executeSwap(
  wallet: TaggedWalletClient,
  quote: Quote,
  swapTx: { to: Address; data: Hex; value: string },
  account: Address,
): Promise<Hex> {
  // Recheck the accept cutoff before broadcasting.
  if (Date.now() >= Date.parse(quote.expiresAt)) {
    throw new Error("Quote expired during approval — request a new one");
  }
  return wallet.sendTransaction({
    account,
    chain: CHAIN,
    to: swapTx.to,
    data: swapTx.data,
    value: BigInt(swapTx.value),
  });
}

/** Pay the supplier in the local stablecoin bought on Textile FX. */
export async function paySupplier(
  publicClient: PublicClient,
  wallet: TaggedWalletClient,
  token: Address,
  supplier: Address,
  amount: bigint,
  account: Address,
): Promise<Hex> {
  const hash = await wallet.writeContract({
    account,
    chain: CHAIN,
    address: token,
    abi: erc20Abi,
    functionName: "transfer",
    args: [supplier, amount],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function tokenDecimals(
  publicClient: PublicClient,
  token: Address,
): Promise<number> {
  return (await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "decimals",
  })) as number;
}

export async function tokenBalance(
  publicClient: PublicClient,
  token: Address,
  holder: Address,
): Promise<bigint> {
  return (await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [holder],
  })) as bigint;
}

/** Confirm the tag is actually on a transaction, on-chain. */
export async function verifyAttribution(
  publicClient: PublicClient,
  txHash: Hex,
): Promise<string[] | null> {
  try {
    const result = await verifyTx({ client: publicClient, hash: txHash });
    return result?.codes ?? null;
  } catch {
    return null;
  }
}
