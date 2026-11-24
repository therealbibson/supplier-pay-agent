import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { parseAbi, type Hex } from 'viem'
import { IDENTITY_REGISTRY } from './config.js'
import { getPublicClient, getTaggedWalletClient } from './attribution.js'

/**
 * ERC-8004 agent registration — https://docs.celo.org/build-on-celo/build-with-ai/8004
 *
 * Order of operations (the agent ID is only known once registration is
 * mined, so this is a two-step dance):
 *   1. Push public/agent.json to the repo (its raw URL is the agentURI).
 *   2. Run this script: it calls register(agentURI) and prints the agent ID.
 *   3. Add the ID to agent.json `registrations`, push, then run this script
 *      again with AGENT_ID set — it calls setAgentURI(agentId, newURI).
 *
 * The agent wallet is set to the address that sends the registration
 * transaction. Gas can be paid in a stablecoin via fee abstraction.
 */

const IDENTITY_ABI = parseAbi([
  'function register(string agentURI) returns (uint256)',
  'function setAgentURI(uint256 agentId, string newURI)',
])

const CELOSCAN = 'https://celoscan.io'

async function main() {
  const agentUri =
    process.env.AGENT_URI ??
    'https://raw.githubusercontent.com/therealbibson/supplier-pay-agent/main/public/agent.json'
  const existingId = process.env.AGENT_ID
    ? BigInt(process.env.AGENT_ID)
    : undefined

  // Sanity: the registration file should exist and be valid JSON.
  try {
    JSON.parse(readFileSync(new URL('../public/agent.json', import.meta.url), 'utf8'))
  } catch {
    console.warn('public/agent.json not found or invalid — register anyway? (continuing)')
  }

  const publicClient = getPublicClient()
  const wallet = getTaggedWalletClient()

  if (existingId !== undefined) {
    console.log(`Updating agentURI for agent ${existingId}...`)
    const hash = await wallet.writeContract({
      address: IDENTITY_REGISTRY,
      abi: IDENTITY_ABI,
      functionName: 'setAgentURI',
      args: [existingId, agentUri],
    })
    await publicClient.waitForTransactionReceipt({ hash })
    console.log(`agentURI updated: ${CELOSCAN}/tx/${hash}`)
    return
  }

  console.log(`Registering agent with URI: ${agentUri}`)
  const hash = await wallet.writeContract({
    address: IDENTITY_REGISTRY,
    abi: IDENTITY_ABI,
    functionName: 'register',
    args: [agentUri],
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  console.log(`Registration tx: ${CELOSCAN}/tx/${hash}`)

  // The agent ID is the ERC-721 token ID. The receipt's first registry log
  // is the Transfer mint (topics[1] is the zero from-address, NOT the ID),
  // so read topics[3] of the Transfer log — that is the token ID. Confirm
  // it on Celoscan before using it anywhere.
  const TRANSFER_SIG =
    '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
  const log = receipt.logs.find(
    (l) =>
      l.address.toLowerCase() === IDENTITY_REGISTRY.toLowerCase() &&
      l.topics[0] === TRANSFER_SIG,
  )
  const agentId = log?.topics[3] ? BigInt(log.topics[3] as Hex) : undefined
  if (agentId === undefined) {
    console.log(
      'Could not decode the agent ID from the receipt — open the tx on Celoscan and read it from the Registered event.',
    )
    return
  }
  console.log(`Agent ID: ${agentId}`)
  console.log('Next steps:')
  console.log(`  1. Add { "agentId": "${agentId}", "agentURI": "${agentUri}" } to public/agent.json registrations and push.`)
  console.log('  2. Set AGENT_ID in .env to the ID above.')
  console.log('  3. Re-run this script to point the registry at the updated file.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
