import { toDataSuffix, verifyTx, withAttribution } from '@celo/attribution-tags'
import {
  createPublicClient,
  createWalletClient,
  http,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { ATTRIBUTION_TAG, CHAIN } from './config.js'

/**
 * Attribution — ERC-8021 suffix via @celo/attribution-tags.
 * https://github.com/celo-org/attribution-tags/blob/main/BUILDERS.md
 *
 * The recommended setup is to tag ONCE where the wallet client is built,
 * not at every call site — a forgotten call site produces untagged
 * transactions with no error anywhere. `withAttribution` wraps
 * sendTransaction / writeContract so every transaction this client sends
 * carries the assigned code.
 *
 * The code is the one Loops House assigned at registration, used verbatim
 * (see the note in src/config.ts — it does not match a repo-slug
 * derivation, so it must not be re-derived).
 */

export function getTakerAccount() {
  const key = process.env.TAKER_PRIVATE_KEY as Hex | undefined
  if (!key) throw new Error('TAKER_PRIVATE_KEY is not set — see .env.example')
  return privateKeyToAccount(key)
}

export function getPublicClient() {
  return createPublicClient({
    chain: CHAIN,
    transport: http(process.env.RPC_URL ?? 'https://forno.celo.org'),
  })
}

/** Wallet client with the attribution tag applied to every transaction. */
export function getTaggedWalletClient() {
  const account = getTakerAccount()
  return createWalletClient({
    account,
    chain: CHAIN,
    transport: http(process.env.RPC_URL ?? 'https://forno.celo.org'),
  }).extend(withAttribution(ATTRIBUTION_TAG))
}

// Chain-aware client types — a bare `PublicClient`/`WalletClient`
// annotation does NOT accept the Celo-formatted client (Celo's formatters
// change block/transaction types), so consumers use these aliases.
export type CeloPublicClient = ReturnType<typeof getPublicClient>
export type TaggedWalletClient = ReturnType<typeof getTaggedWalletClient>

/** The raw suffix bytes, for call sites that build calldata by hand. */
export function attributionSuffix(): Hex {
  return toDataSuffix(ATTRIBUTION_TAG) as Hex
}

/**
 * After the first tagged transaction, close the loop: decode it on-chain
 * and confirm the assigned code is actually in the suffix. Returns the
 * codes found, or null if the transaction carries no tag.
 */
export async function verifyAttribution(txHash: Hex): Promise<string[] | null> {
  const client = getPublicClient()
  const result = await verifyTx({ client, hash: txHash })
  return result?.codes ?? null
}
