import {
  encodeFunctionData,
  erc20Abi,
  type Address,
  type Hex,
} from 'viem'
import type {
  CeloPublicClient,
  TaggedWalletClient,
} from './attribution.js'
import { TEXTILE_REACTOR } from './config.js'
import type { Quote } from './textile.js'

/**
 * Approve `takerPays` of the sell token to the Textile reactor, if the
 * standing allowance doesn't already cover it. The approval MUST confirm
 * before the swap is broadcast — the reactor pulls the sell token inside
 * `executeBatch`, so broadcasting both into the same block risks the swap
 * landing first and reverting.
 *
 * USDT-style tokens reject approve(nonzero -> nonzero), so an existing
 * nonzero allowance is reset to zero first.
 */
export async function approveIfNeeded(
  publicClient: CeloPublicClient,
  wallet: TaggedWalletClient,
  sellToken: Address,
  taker: Address,
  required: bigint,
): Promise<Hex | null> {
  const allowance = (await publicClient.readContract({
    address: sellToken,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [taker, TEXTILE_REACTOR],
  })) as bigint
  if (allowance >= required) return null

  if (allowance > 0n) {
    const resetHash = await wallet.sendTransaction({
      to: sellToken,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [TEXTILE_REACTOR, 0n],
      }),
      value: 0n,
    })
    await publicClient.waitForTransactionReceipt({ hash: resetHash })
  }

  const hash = await wallet.sendTransaction({
    to: sellToken,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [TEXTILE_REACTOR, required],
    }),
    value: 0n,
  })
  await publicClient.waitForTransactionReceipt({ hash })
  return hash
}

/**
 * Broadcast the swap exactly as Textile returned it (`transactions.swap`).
 * Never execute the top-level `encodedOrder` / `signature` directly — on a
 * multi-maker quote those are only the first order and you would under-fill.
 *
 * The wallet client is extended with `withAttribution`, so the Loops House
 * tag is appended to the calldata automatically. Textile's own
 * `includeAttribution` is left off, so our tag is the only one.
 */
export async function executeSwap(
  wallet: TaggedWalletClient,
  quote: Quote,
  swapTx: { to: Address; data: Hex; value: string },
): Promise<Hex> {
  // Recheck the accept cutoff before broadcasting.
  if (Date.now() >= Date.parse(quote.expiresAt)) {
    throw new Error('Quote expired during approval — request a new one')
  }
  return wallet.sendTransaction({
    to: swapTx.to,
    data: swapTx.data,
    value: BigInt(swapTx.value),
  })
}
