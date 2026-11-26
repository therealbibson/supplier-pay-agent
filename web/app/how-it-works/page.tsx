import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BottomNav } from "@/components/BottomNav";
import {
  AGENT_WALLET,
  ATTRIBUTION_TAG,
  CELOSCAN,
  ERC8004_AGENT_ID,
  GITHUB_REPO,
  SELF_AGENT_ID,
} from "@/lib/config";

/**
 * How it works — its own page: the 3 steps, the live proof, and a
 * plain-language safety section. Linked from the header and footer.
 */
export default function HowItWorks() {
  return (
    <div className="min-h-screen bg-white text-slate-800">
      <Header />

      <main className="mx-auto max-w-lg px-4 pb-10 pt-10">
        <p className="text-xs font-semibold uppercase tracking-widest text-green-600">
          Celo · Agents Open for Business — Stablecoin Corridors
        </p>
        <h1 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
          How PayBridge works
        </h1>
        <p className="mt-4 text-lg text-slate-600">
          PayBridge gets a Textile FX quote and pays an overseas supplier in
          their local stablecoin on Celo. You pay from your own wallet — no
          account, no deposit, no middleman holding your money.
        </p>

        <ol className="mt-8 space-y-4">
          <li className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-green-600 text-sm font-extrabold text-white">
              1
            </span>
            <h2 className="mt-4 text-base font-bold">Get a quote</h2>
            <p className="mt-2 text-sm text-slate-600">
              Request a Textile FX quote — USD₮ → cNGN and other corridors.
              The quote shows exactly what you pay, what the supplier gets,
              and the fee, before anything moves.
            </p>
          </li>
          <li className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-green-600 text-sm font-extrabold text-white">
              2
            </span>
            <h2 className="mt-4 text-base font-bold">Swap on Celo</h2>
            <p className="mt-2 text-sm text-slate-600">
              The swap runs on Celo mainnet, with the attribution tag
              on-chain. You approve the swap in your wallet — nothing happens
              without your say-so.
            </p>
          </li>
          <li className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-green-600 text-sm font-extrabold text-white">
              3
            </span>
            <h2 className="mt-4 text-base font-bold">Supplier paid</h2>
            <p className="mt-2 text-sm text-slate-600">
              The supplier receives payment in their local stablecoin, and
              every transaction is visible on Celoscan.
            </p>
          </li>
        </ol>
        <p className="mt-5 text-sm text-slate-500">
          Corridors: USD₮ ↔ cNGN, IDRX, wBRL, wARS, wMXN, wCOP.
        </p>

        <h2 className="mt-12 text-2xl font-extrabold tracking-tight">
          Live proof
        </h2>
        <p className="mt-2 text-slate-500">
          Registered on Celo mainnet. Verifiable on Celoscan.
        </p>
        <div className="mt-6 rounded-3xl border border-slate-200 bg-white px-6 py-2 shadow-sm">
          <dl>
            <div className="grid gap-1 border-b border-slate-200 py-4 sm:grid-cols-[180px_1fr] sm:gap-4 sm:items-baseline">
              <dt className="text-sm font-semibold text-slate-500">
                ERC-8004 Agent ID
              </dt>
              <dd className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-semibold">{ERC8004_AGENT_ID}</span>
                <a
                  href={`${CELOSCAN}/tx/0x2c0f3c3d89ff1fd26eef5d3e770abe748b8085520b18b6c0c12c52ce7977991d`}
                  target="_blank"
                  rel="noopener"
                  className="text-sm font-medium text-green-700 hover:underline"
                >
                  View registration transaction ↗
                </a>
              </dd>
            </div>
            <div className="grid gap-1 border-b border-slate-200 py-4 sm:grid-cols-[180px_1fr] sm:gap-4 sm:items-baseline">
              <dt className="text-sm font-semibold text-slate-500">
                Self Agent ID
              </dt>
              <dd className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-semibold">{SELF_AGENT_ID}</span>
                <a
                  href={`${CELOSCAN}/token/0xaC3DF9ABf80d0F5c020C06B04Cced27763355944?a=219`}
                  target="_blank"
                  rel="noopener"
                  className="text-sm font-medium text-green-700 hover:underline"
                >
                  View on Celoscan ↗
                </a>
              </dd>
            </div>
            <div className="grid gap-1 border-b border-slate-200 py-4 sm:grid-cols-[180px_1fr] sm:gap-4 sm:items-baseline">
              <dt className="text-sm font-semibold text-slate-500">
                Attribution Tag
              </dt>
              <dd className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <code className="font-mono text-sm font-medium">
                  {ATTRIBUTION_TAG}
                </code>
              </dd>
            </div>
            <div className="grid gap-1 py-4 sm:grid-cols-[180px_1fr] sm:gap-4 sm:items-baseline">
              <dt className="text-sm font-semibold text-slate-500">
                Agent Wallet
              </dt>
              <dd className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <code className="font-mono text-xs font-medium break-all sm:text-sm">
                  {AGENT_WALLET}
                </code>
                <a
                  href={`${CELOSCAN}/address/${AGENT_WALLET}`}
                  target="_blank"
                  rel="noopener"
                  className="text-sm font-medium text-green-700 hover:underline"
                >
                  View on Celoscan ↗
                </a>
              </dd>
            </div>
          </dl>
        </div>

        <h2 className="mt-12 text-2xl font-extrabold tracking-tight">
          Is PayBridge safe?
        </h2>
        <div className="mt-6 space-y-4 rounded-3xl border border-slate-200 bg-white p-6 text-sm leading-relaxed text-slate-600 shadow-sm">
          <p>
            <strong className="text-slate-800">
              Your keys never leave your wallet.
            </strong>{" "}
            PayBridge is non-custodial: it never asks for your seed phrase,
            your private key, or any password — there is nowhere in the app to
            type one, and the code contains none of those things. Your wallet
            stays in charge of your money at all times.
          </p>
          <p>
            <strong className="text-slate-800">
              Connecting only shares your public address.
            </strong>{" "}
            When you connect, the app asks your wallet for its public address
            so it can show your balances. No signature, no approval, no
            transaction happens at connect — and connecting alone can never
            move your funds.
          </p>
          <p>
            <strong className="text-slate-800">
              A signature cannot move your funds.
            </strong>{" "}
            Before a firm quote, your wallet may ask you to sign a short
            message proving you control the wallet. That signature only proves
            ownership to Textile so they give you a quote. It is not a
            transaction and it cannot spend anything. You can reject it safely
            and nothing happens.
          </p>
          <p>
            <strong className="text-slate-800">
              Every step asks you first.
            </strong>{" "}
            The approval, the swap, and the payout each open a confirmation in
            your wallet, showing exactly what will happen. If anything looks
            wrong, reject it — nothing is sent.
          </p>
          <p>
            <strong className="text-slate-800">
              What leaves your browser:
            </strong>{" "}
            only public information — your wallet address, the amounts and the
            currencies you choose — sent to PayBridge&apos;s own server routes
            to fetch a quote, and the ownership signature sent to Textile.
            Your keys, seed phrase and passwords never leave your wallet, and
            PayBridge has no way to access them.
          </p>
          <p>
            <strong className="text-slate-800">
              Seeing a warning from your wallet?
            </strong>{" "}
            PayBridge is new and runs on a vercel.app address, and wallet
            safety tools sometimes flag unfamiliar sites. Before connecting,
            check the address bar shows{" "}
            <code className="font-mono text-xs font-medium text-slate-800">
              paybridge-iota.vercel.app
            </code>{" "}
            — and remember that connecting alone shares only your public
            address.
          </p>
          <p>
            <strong className="text-slate-800">
              Don&apos;t take our word for it.
            </strong>{" "}
            The whole app is open source — read it yourself:{" "}
            <a
              href={`https://github.com/${GITHUB_REPO}`}
              target="_blank"
              rel="noopener"
              className="font-medium text-green-700 hover:underline"
            >
              github.com/{GITHUB_REPO} ↗
            </a>
          </p>
        </div>
      </main>

      <Footer />
      <BottomNav />
    </div>
  );
}
