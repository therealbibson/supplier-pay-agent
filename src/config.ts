import { celo } from 'viem/chains'
import type { Address } from 'viem'

export const CHAIN = celo // Celo mainnet, chainId 42220

export const TEXTILE_API = 'https://api.textilecredit.com/v2'

/** Token addresses on Celo mainnet (from the hackathon track page). */
export const TOKENS = {
  USD_T: '0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e',
  cNGN: '0xF6829D7393dAe24509eb1E52eE8e572e2E271a4f',
  IDRX: '0x18Bc5bcC660cf2B9cE3cd51a404aFe1a0cBD3C22',
  wARS: '0x0DC4F92879B7670e5f4e4e6e3c801D229129D90D',
  wBRL: '0xD76f5Faf6888e24D9F04Bf92a0c8B921FE4390e0',
  wMXN: '0x337E7456B420bD3481e7FA61fA9850343d610d34',
  wCOP: '0x8a1D45e102e886510e891d2Ec656a708991e2D76',
} as const satisfies Record<string, Address>

/** Textile LimitOrderReactor on Celo mainnet. */
export const TEXTILE_REACTOR =
  '0xa9AA0a64769cBed4d3B1Ceb4Df01CdE915C235b3' as Address

/** ERC-8004 registries on Celo mainnet. */
export const IDENTITY_REGISTRY =
  '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as Address
export const REPUTATION_REGISTRY =
  '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63' as Address

/**
 * Attribution tag assigned by Loops House at registration.
 * Used VERBATIM. The Celo attribution guide suggests checking an assigned
 * code against `codeFromRepo('owner/repo')`, but that check FAILS for this
 * project: sha256("therealbibson/supplier-pay-agent") starts with
 * 676f43947f45, not 7f040b6e9d4f — so Loops House derives its code from
 * something other than the repo slug. Do not re-derive it, and if the repo
 * is ever renamed, re-check the tag on Loops House before sending more
 * transactions. The on-chain check that matters is `verifyTx` after the
 * first tagged transaction (see src/attribution.ts).
 */
export const ATTRIBUTION_TAG =
  process.env.ATTRIBUTION_TAG ?? 'celo_7f040b6e9d4f'

export const GITHUB_REPO = 'therealbibson/supplier-pay-agent'

/** Corridors the track accepts: USD₮ <-> local stablecoin. */
export const LOCAL_STABLECOINS = [
  'cNGN',
  'IDRX',
  'wARS',
  'wBRL',
  'wMXN',
  'wCOP',
] as const
export type LocalStablecoin = (typeof LOCAL_STABLECOINS)[number]
