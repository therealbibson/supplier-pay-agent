import {
  erc20Abi,
  type Address,
  type Hex,
} from 'viem'
import type {
  CeloPublicClient,
  TaggedWalletClient,
} from './attribution.js'

/**
 * Pay the supplier in the local stablecoin bought on Textile FX.
 * A plain ERC-20 transfer, sent through the tagged wallet client so the
 * payout carries the attribution tag too. The EVM ignores the trailing
 * suffix bytes, so the transfer itself is unaffected.
 */
export async function paySupplier(
  publicClient: CeloPublicClient,
  wallet: TaggedWalletClient,
  token: Address,
  supplier: Address,
  amount: bigint,
): Promise<Hex> {
  const hash = await wallet.writeContract({
    address: token,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [supplier, amount],
  })
  await publicClient.waitForTransactionReceipt({ hash })
  return hash
}

export async function tokenDecimals(
  publicClient: CeloPublicClient,
  token: Address,
): Promise<number> {
  return (await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: 'decimals',
  })) as number
}

export async function tokenBalance(
  publicClient: CeloPublicClient,
  token: Address,
  holder: Address,
): Promise<bigint> {
  return (await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [holder],
  })) as bigint
}
