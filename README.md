# PayBridge

An agent for small importers on **Celo**. It takes a supplier invoice,
gets a firm [Textile FX](https://fx-docs.textilecredit.com) request-for-quote,
converts **USD₮ → the supplier's local stablecoin** (cNGN, IDRX, wBRL,
wARS, wMXN or wCOP) on Celo mainnet, and pays the supplier — with every
conversion and payout carrying the hackathon attribution tag onchain.

Built for **Celo "Agents Open for Business"** — Stablecoin Corridors track.
Submissions close Mon 7 Dec 2026, 10:00 WAT.

![logo](logo.png)

## How it works

```
invoice (supplier address + amount + currency)
  → Textile RFQ preview          (free estimate, no signature)
  → Textile RFQ firm request     (keyless: TakerControl proof, or API key)
  → approve takerPays → swap     (Textile LimitOrderReactor, tagged)
  → submit tx hash to Textile    (settlement reconciliation)
  → pay supplier in local stablecoin (ERC-20 transfer, tagged)
```

- **Chain:** Celo mainnet (42220). Testnet references are fine; judged
  activity must be mainnet.
- **Attribution:** every transaction is sent through a viem wallet client
  extended with `@celo/attribution-tags` using the tag assigned at
  registration (`celo_7f040b6e9d4f`). The tag is used verbatim — see
  `src/attribution.ts` for why it is not re-derived.
- **Identity:** the agent is registered on ERC-8004 (Identity Registry
  `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`); see `public/agent.json`
  and `src/erc8004.ts`.

## Setup

```bash
npm install
cp .env.example .env   # fill in TAKER_PRIVATE_KEY (dedicated wallet!)
```

## Use

```bash
# Preview only — no signature, no transaction
npm run preview -- --supplier 0xSupplierAddress --amount 50 --currency cNGN --invoice INV-001

# Live run (requires CONFIRM_MAINNET=true in .env)
npm run pay -- --supplier 0xSupplierAddress --amount 50 --currency cNGN --invoice INV-001

# Register the agent on ERC-8004 (after pushing public/agent.json)
npm run register-agent
```

The demo payout goes to a real supplier outside the team, in their local
stablecoin, as the track requires. Amounts are small on purpose.

## Track requirements checklist

- [ ] At least one tagged Textile FX conversion on Celo mainnet in a listed corridor, used in the product flow
- [ ] Payment in a local stablecoin reaches a recipient outside the team
- [ ] ERC-8004 identity registered
- [ ] Public repo (this one) resolving at judging
- [ ] No arbitrage, self-trading, or acting as a Textile maker

## Links

- Hackathon: https://www.loops.house/agents-open-for-business
- Textile FX docs: https://fx-docs.textilecredit.com
- ERC-8004 on Celo: https://docs.celo.org/build-on-celo/build-with-ai/8004
- Attribution tags: https://github.com/celo-org/attribution-tags
