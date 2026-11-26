# PayBridge web app

A real, usable PayBridge: connect your wallet, get a Textile FX quote, swap
USD₮ for a local stablecoin and pay a supplier — all on Celo mainnet, all
from the browser. This replaces the old static landing page.

## Run it locally

```bash
cd web
npm install
npm run dev    # http://localhost:3000
```

Production build:

```bash
npm run build
npm start
```

## How it works

1. **Connect wallet** — injected wallet (MetaMask etc.) via wagmi, Celo
   mainnet only (chainId 42220). Wrong network prompts a switch.
2. **Pay form** — supplier wallet address, amount in USD₮, target currency
   (cNGN default; also IDRX, wBRL, wARS, wMXN, wCOP), optional invoice
   reference.
3. **Estimate** — free Textile preview via `POST /api/rfq/preview`.
4. **Firm quote** — `POST /api/rfq/request` (75 s timeout; the route sets
   `maxDuration = 75`). Keyless: the server sends unsigned first and, if
   Textile answers 401 `proof_of_control_required`, the app asks the wallet
   to sign the EIP-712 TakerControl message and retries with the proof.
5. **Confirm** — exact amounts, fee, rate and quote expiry countdown.
   Nothing is sent until the user confirms.
6. **Execute** — ERC-20 approval for `takerPays` (with the USDT
   reset-to-zero step when needed, and the approval must confirm first),
   then the swap broadcast exactly as Textile returned it
   (`transactions.swap` — never the top-level `encodedOrder`), then the
   swap hash is reported to Textile, the fill is polled, then the supplier
   is paid the filled amount in the local stablecoin.
7. **Results** — amounts in/out, fee, and every transaction hash linked to
   Celoscan, plus an on-chain check that the attribution tag is present.

**Attribution:** every transaction the app sends goes through a wallet
client extended with `withAttribution("celo_7f040b6e9d4f")` (see
`lib/execute.ts`), exactly like the CLI. The tag is on the approval, the
swap and the payout.

**API routes** (`app/api/rfq/*`) proxy Textile server-side so the browser
never hits Textile directly and CORS is never an issue. No API key is
needed for the keyless flow; none is configured or committed.

**Money:** the user pays from their own connected wallet on mainnet. The
app never auto-sends anything — every on-chain step asks for confirmation
in the wallet.

## The wallet

The home page is a wallet, not a landing page: a balance card (USD₮
large, CELO for gas and cNGN beneath), a Send-style pay flow, recent
payments, and a trust strip ("Non-custodial — your keys never leave your
wallet"). How it works and the live proof live on their own page at
`/how-it-works`, which also has a plain-language safety section.

**History** (`/history`, linked from the wallet tabs) shows the connected
wallet's real on-chain history, synced live from Celo via the Blockscout
v2 API through `GET /api/history` (server-side proxy, no API key). The
route merges Blockscout's `/transactions` and `/token-transfers`
endpoints — the transactions list does not embed token transfers, so both
are needed — dedupes by transaction hash, and flags PayBridge activity
(swaps into the Textile reactor, payouts in a local stablecoin,
approvals whose spender is the reactor). Paging is cursor-based per
source (Blockscout's `next_page_params` shape varies and is forwarded
verbatim as opaque base64url cursors; an exhausted source is marked
done so it is not re-fetched). The home page's Recent payments is a
preview of the same on-chain data — one source of truth, no separate
session history. Payments appear once confirmed on-chain.

## What still needs doing to put it live

1. **Push `web/` to GitHub** (not done here).
2. **Vercel root directory switch** (not done here): the Vercel project
   `paybridge-iota` currently serves the old static page from `landing/`.
   Change its Root Directory to `web` and redeploy. Note the firm-quote
   route runs up to 75 s — set the function `maxDuration` accordingly if
   the plan caps it lower (the route already declares `maxDuration = 75`).
3. **Live test with real funds**: the end-to-end flow (quote → approval →
   swap → payout) is ported from the CLI and the build passes, but it has
   not been run against mainnet from this app yet. Test with a small amount
   (~$1–$5) first, then the demo run for the hackathon form.
4. **Update the Loops House form** if the live app URL changes (it stays
   `paybridge-iota.vercel.app` if only the root directory switches).
