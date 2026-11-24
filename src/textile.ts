import crypto from 'node:crypto'
import { toHex, type Address, type Hex } from 'viem'
import type { PrivateKeyAccount } from 'viem/accounts'
import { TEXTILE_API } from './config.js'

/**
 * Textile FX RFQ API v2 — https://fx-docs.textilecredit.com/api/v2/rfq.html
 *
 * Flow: preview (free estimate) -> request (firm quote, blocks up to ~70 s
 * worst case; client timeout 75 s) -> approve -> swap -> submit tx hash.
 * A firm request is bound to one `taker` wallet. Keyless callers prove
 * control with a TakerControl EIP-712 signature; partner API keys skip it.
 */

export interface Quote {
  sellAmount: string
  buyAmount: string
  feeAmount: string
  takerPays: string
  rateRay: string
  expiresAt: string
  orderDeadline: string
  latestOrderDeadline: string
  reactor: Address
  encodedOrder: Hex
  signature: Hex
  orders: Array<{ encodedOrder: Hex; signature: Hex; sellAmount: string; buyAmount: string; feeAmount: string; maker: Address }>
}

export interface RfqResponse {
  rfqId: string
  claimToken: string
  status: 'quoted' | 'no_quote' | 'preview'
  quote?: Quote
  transactions?: {
    approval: { to: Address; data: Hex; value: string; chainId: number }
    swap: { to: Address; data: Hex; value: string; chainId: number }
  }
  reason?: string
  availableSellAmount?: string
  availableBuyAmount?: string
  reservedUntil?: string
  retryAfterMs?: number
}

export interface RfqStatus {
  rfqId: string
  status: 'soliciting' | 'quoted' | 'no_quote' | 'submitted' | 'filled' | 'failed' | 'expired'
  sellAmount: string
  buyAmount: string
  feeAmount: string
  taker: Address
  txHash?: string | null
  failReason?: string | null
}

function apiKeyHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (process.env.TEXTILE_API_KEY) {
    headers.Authorization = `Bearer ${process.env.TEXTILE_API_KEY}`
  }
  return headers
}

function claimHeaders(claimToken: string): Record<string, string> {
  const headers = apiKeyHeaders()
  if (!process.env.TEXTILE_API_KEY) {
    // Keyless callers prove RFQ ownership with the claim token.
    headers['X-Rfq-Claim'] = claimToken
  }
  return headers
}

export interface PreviewQuote {
  sellAmount: string
  buyAmount: string
  feeAmount: string
  takerPays: string
  rateRay: string
  availableSellAmount?: string
}

/** Free estimate — no taker, no signature, nothing reserved. */
export async function previewQuote(args: {
  chainId: number
  sellToken: Address
  buyToken: Address
  sellAmount?: string
  buyAmount?: string
}): Promise<PreviewQuote | null> {
  const res = await fetch(`${TEXTILE_API}/rfq/preview`, {
    method: 'POST',
    headers: apiKeyHeaders(),
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(30_000),
  })
  const json = (await res.json()) as { data: RfqResponse & PreviewQuote }
  if (json.data.status === 'no_quote') return null
  const { sellAmount, buyAmount, feeAmount, takerPays, rateRay, availableSellAmount } =
    json.data
  return { sellAmount, buyAmount, feeAmount, takerPays, rateRay, availableSellAmount }
}

/**
 * EIP-712 TakerControl proof — domain "Textile Taker Control" v1.
 * `issuedAt` must be within 60 s of Textile's clock. One verified proof
 * covers the wallet + chain for ~12 h (grant); requests inside the window
 * may omit it, so we only sign when the API answers 401.
 */
export async function signTakerControl(
  account: PrivateKeyAccount,
  chainId: number,
): Promise<{ nonce: Hex; issuedAt: number; signature: Hex }> {
  const nonce = toHex(crypto.randomBytes(32))
  const issuedAt = Date.now() // Unix milliseconds, not seconds
  const signature = await account.signTypedData({
    domain: { name: 'Textile Taker Control', version: '1', chainId },
    types: {
      TakerControl: [
        { name: 'taker', type: 'address' },
        { name: 'chainId', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
        { name: 'issuedAt', type: 'uint256' },
      ],
    },
    primaryType: 'TakerControl',
    message: {
      taker: account.address,
      chainId: BigInt(chainId),
      nonce,
      issuedAt: BigInt(issuedAt),
    },
  })
  return { nonce, issuedAt, signature }
}

/**
 * Firm quote. Sends unsigned first; signs TakerControl only if the API
 * answers 401 proof_of_control_required. Blocks up to ~70 s worst case,
 * so the client timeout is 75 s as the docs require.
 */
export async function requestFirmQuote(args: {
  chainId: number
  sellToken: Address
  buyToken: Address
  sellAmount?: string
  buyAmount?: string
  taker: Address
  account: PrivateKeyAccount
}): Promise<RfqResponse> {
  const { account, ...body } = args
  const send = (extra: Record<string, unknown> = {}) =>
    fetch(`${TEXTILE_API}/rfq/request`, {
      method: 'POST',
      headers: apiKeyHeaders(),
      body: JSON.stringify({ ...body, ...extra }),
      signal: AbortSignal.timeout(75_000),
    })

  let res = await send()
  if (res.status === 401) {
    const err = (await res.clone().json()) as {
      error?: { details?: { reason?: string } }
    }
    if (err.error?.details?.reason === 'proof_of_control_required') {
      const takerProof = await signTakerControl(account, args.chainId)
      res = await send({ takerProof })
    }
  }
  if (!res.ok) {
    throw new Error(`Textile RFQ request failed: ${res.status} ${await res.text()}`)
  }
  const json = (await res.json()) as { data: RfqResponse }
  return json.data
}

/** Report the broadcast swap hash so Textile reconciles the fill. */
export async function submitTx(rfqId: string, claimToken: string, txHash: Hex): Promise<RfqStatus> {
  const res = await fetch(`${TEXTILE_API}/rfq/${rfqId}/submit`, {
    method: 'POST',
    headers: claimHeaders(claimToken),
    body: JSON.stringify({ txHash }),
  })
  if (!res.ok) throw new Error(`Textile submit failed: ${res.status}`)
  return ((await res.json()) as { data: RfqStatus }).data
}

export async function getRfqStatus(rfqId: string, claimToken: string): Promise<RfqStatus> {
  const res = await fetch(`${TEXTILE_API}/rfq/${rfqId}`, {
    headers: claimHeaders(claimToken),
  })
  if (!res.ok) throw new Error(`Textile status failed: ${res.status}`)
  return ((await res.json()) as { data: RfqStatus }).data
}

export async function cancelQuote(rfqId: string, claimToken: string): Promise<void> {
  const res = await fetch(`${TEXTILE_API}/rfq/${rfqId}/cancel`, {
    method: 'POST',
    headers: claimHeaders(claimToken),
  })
  if (!res.ok && res.status !== 409) {
    throw new Error(`Textile cancel failed: ${res.status}`)
  }
}
