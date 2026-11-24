#!/usr/bin/env node
import 'dotenv/config'
import {
  erc20Abi,
  formatUnits,
  parseUnits,
  type Address,
  type Hex,
} from 'viem'
import {
  getPublicClient,
  getTaggedWalletClient,
  getTakerAccount,
  verifyAttribution,
} from './attribution.js'
import { CHAIN, LOCAL_STABLECOINS, TOKENS, type LocalStablecoin } from './config.js'
import { paySupplier, tokenBalance, tokenDecimals } from './payout.js'
import { approveIfNeeded, executeSwap } from './swap.js'
import {
  getRfqStatus,
  previewQuote,
  requestFirmQuote,
  submitTx,
} from './textile.js'

/**
 * Supplier Pay Agent — CLI.
 *
 *   npm run preview -- --supplier 0x... --amount 50 --currency cNGN --invoice INV-001
 *   npm run pay     -- --supplier 0x... --amount 50 --currency cNGN --invoice INV-001
 *
 * --amount is the USD₮ to spend (exact-input). The agent quotes USD₮ ->
 * <currency> on Textile FX, swaps, then pays the supplier the bought
 * amount in the local stablecoin. Live execution requires
 * CONFIRM_MAINNET=true in .env; otherwise the run stops after preview.
 */

const CELOSCAN = 'https://celoscan.io'

interface Args {
  supplier: Address
  amount: string
  currency: LocalStablecoin
  invoice: string
  previewOnly: boolean
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const supplier = get('--supplier')
  const amount = get('--amount')
  const currency = (get('--currency') ?? 'cNGN') as LocalStablecoin
  const invoice = get('--invoice') ?? `INV-${Date.now()}`
  if (!supplier || !/^0x[0-9a-fA-F]{40}$/.test(supplier)) {
    throw new Error('--supplier <0x address> is required')
  }
  if (!amount || Number(amount) <= 0) {
    throw new Error('--amount <USD₮ to spend> is required, e.g. --amount 50')
  }
  if (!(LOCAL_STABLECOINS as readonly string[]).includes(currency)) {
    throw new Error(`--currency must be one of: ${LOCAL_STABLECOINS.join(', ')}`)
  }
  return {
    supplier: supplier as Address,
    amount,
    currency,
    invoice,
    previewOnly: argv.includes('--preview-only'),
  }
}

async function main() {
  const args = parseArgs()
  const sellToken = TOKENS.USD_T
  const buyToken = TOKENS[args.currency]
  const publicClient = getPublicClient()

  console.log(`Invoice ${args.invoice}: pay ${args.supplier} in ${args.currency}`)

  const sellDecimals = await tokenDecimals(publicClient, sellToken)
  const buyDecimals = await tokenDecimals(publicClient, buyToken)
  const sellAmount = parseUnits(args.amount, sellDecimals)

  // 1. Preview — free estimate, no wallet or signature needed.
  const preview = await previewQuote({
    chainId: CHAIN.id,
    sellToken,
    buyToken,
    sellAmount: sellAmount.toString(),
  })
  if (!preview) {
    throw new Error('No preview quote available for this corridor right now.')
  }
  console.log(
    `Preview: spend ${formatUnits(BigInt(preview.takerPays), sellDecimals)} USD₮ ` +
      `-> receive ~${formatUnits(BigInt(preview.buyAmount), buyDecimals)} ${args.currency} ` +
      `(fee ${formatUnits(BigInt(preview.feeAmount), sellDecimals)} USD₮)`,
  )
  if (args.previewOnly) {
    console.log('Preview only — no transactions sent.')
    return
  }

  // Live path — the wallet is only needed from here on.
  const account = getTakerAccount()
  const wallet = getTaggedWalletClient()
  console.log(`Taker wallet: ${account.address}`)

  const balance = await tokenBalance(publicClient, sellToken, account.address)
  if (balance < sellAmount) {
    throw new Error(
      `Insufficient USD₮ balance: have ${formatUnits(balance, sellDecimals)}, need ${args.amount}`,
    )
  }
  if (process.env.CONFIRM_MAINNET !== 'true') {
    console.log('Live run blocked: set CONFIRM_MAINNET=true in .env to send transactions.')
    return
  }

  // 2. Firm quote — blocks while makers answer (up to ~70 s worst case).
  const rfq = await requestFirmQuote({
    chainId: CHAIN.id,
    sellToken,
    buyToken,
    sellAmount: sellAmount.toString(),
    taker: account.address,
    account,
  })
  if (rfq.status === 'no_quote' || !rfq.quote || !rfq.transactions) {
    throw new Error(
      `No firm quote: ${rfq.reason ?? 'unknown'} (available: ${rfq.availableSellAmount ?? 'n/a'})`,
    )
  }
  const { rfqId, claimToken, quote, transactions } = rfq
  console.log(
    `Firm quote ${rfqId}: spend ${formatUnits(BigInt(quote.takerPays), sellDecimals)} USD₮ ` +
      `-> receive ${formatUnits(BigInt(quote.buyAmount), buyDecimals)} ${args.currency}, ` +
      `expires ${quote.expiresAt}`,
  )

  // 3. Approve takerPays, wait for the receipt, then swap.
  const approvalHash = await approveIfNeeded(
    publicClient,
    wallet,
    sellToken,
    account.address,
    BigInt(quote.takerPays),
  )
  if (approvalHash) console.log(`Approval: ${CELOSCAN}/tx/${approvalHash}`)
  const swapHash = await executeSwap(wallet, quote, transactions.swap)
  console.log(`Swap: ${CELOSCAN}/tx/${swapHash}`)

  // 4. Report the hash so Textile reconciles the fill, then wait for it.
  await submitTx(rfqId, claimToken, swapHash)
  let status = await getRfqStatus(rfqId, claimToken)
  for (let i = 0; i < 30 && status.status !== 'filled'; i++) {
    await new Promise((r) => setTimeout(r, 3000))
    status = await getRfqStatus(rfqId, claimToken)
  }
  if (status.status !== 'filled') {
    throw new Error(`Swap did not fill in time (status: ${status.status}). Check ${CELOSCAN}/tx/${swapHash}`)
  }
  console.log(`Swap filled: received ${formatUnits(BigInt(status.buyAmount), buyDecimals)} ${args.currency}`)

  // 5. Pay the supplier in the local stablecoin.
  const payoutHash = await paySupplier(
    publicClient,
    wallet,
    buyToken,
    args.supplier,
    BigInt(status.buyAmount),
  )
  console.log(
    `Paid ${args.supplier} ${formatUnits(BigInt(status.buyAmount), buyDecimals)} ${args.currency}: ${CELOSCAN}/tx/${payoutHash}`,
  )

  // 6. Close the attribution loop: confirm the tag is on-chain.
  const codes = await verifyAttribution(swapHash)
  console.log(`Attribution on swap tx: ${codes ? codes.join(', ') : 'NONE FOUND — check the tag!'}`)

  console.log(`Done. Invoice ${args.invoice} settled.`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
