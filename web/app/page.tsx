import { ConnectWallet } from "@/components/ConnectWallet";
import { PayFlow } from "@/components/PayFlow";
import {
  AGENT_WALLET,
  ATTRIBUTION_TAG,
  CELOSCAN,
  ERC8004_AGENT_ID,
  GITHUB_REPO,
  SELF_AGENT_ID,
} from "@/lib/config";

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-slate-800">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-3.5">
          <a href="#" className="flex items-center gap-2.5">
            <img
              src="/logo.png"
              alt="PayBridge logo"
              width={36}
              height={36}
              className="block h-9 w-9 rounded-full"
            />
            <span className="text-xl font-extrabold tracking-tight">
              PayBridge<span className="text-green-600">.</span>
            </span>
          </a>
          <nav className="flex items-center gap-4">
            <a
              href="#how-it-works"
              className="hidden text-sm font-medium text-slate-600 hover:text-slate-800 sm:block"
            >
              How it works
            </a>
            <a
              href="#live-proof"
              className="hidden text-sm font-medium text-slate-600 hover:text-slate-800 sm:block"
            >
              Live proof
            </a>
            <ConnectWallet />
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-4xl px-6 pb-10 pt-14 sm:pt-20">
          <p className="text-xs font-semibold uppercase tracking-widest text-green-600">
            Celo · Agents Open for Business — Stablecoin Corridors
          </p>
          <h1 className="mt-4 max-w-2xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Pay overseas suppliers in their local stablecoin.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-slate-600">
            PayBridge gets a Textile FX quote and pays an overseas supplier in
            their local stablecoin on Celo. Connect your wallet and pay — you
            pay from your own funds on Celo mainnet.
          </p>

          {/* The app itself, front and centre */}
          <div id="pay" className="mt-10">
            <PayFlow />
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="mx-auto max-w-4xl px-6 pb-14">
          <h2 className="text-2xl font-extrabold tracking-tight">How it works</h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-3">
            <li className="rounded-2xl border border-slate-200 bg-white p-6">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-green-600 text-sm font-extrabold text-white">
                1
              </span>
              <h3 className="mt-4 text-base font-bold">Get a quote</h3>
              <p className="mt-2 text-sm text-slate-600">
                Request a Textile FX quote — USD₮ → cNGN and other corridors.
              </p>
            </li>
            <li className="rounded-2xl border border-slate-200 bg-white p-6">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-green-600 text-sm font-extrabold text-white">
                2
              </span>
              <h3 className="mt-4 text-base font-bold">Swap on Celo</h3>
              <p className="mt-2 text-sm text-slate-600">
                The swap runs on Celo mainnet, with the attribution tag on-chain.
              </p>
            </li>
            <li className="rounded-2xl border border-slate-200 bg-white p-6">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-green-600 text-sm font-extrabold text-white">
                3
              </span>
              <h3 className="mt-4 text-base font-bold">Supplier paid</h3>
              <p className="mt-2 text-sm text-slate-600">
                The supplier receives payment in their local stablecoin.
              </p>
            </li>
          </ol>
          <p className="mt-5 text-sm text-slate-500">
            Corridors: USD₮ ↔ cNGN, IDRX, wBRL, wARS, wMXN, wCOP.
          </p>
        </section>

        {/* Live proof */}
        <section id="live-proof" className="mx-auto max-w-4xl px-6 pb-14">
          <h2 className="text-2xl font-extrabold tracking-tight">Live proof</h2>
          <p className="mt-2 text-slate-500">
            Registered on Celo mainnet. Verifiable on Celoscan.
          </p>
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white px-6 py-2">
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
                  <code className="font-mono text-sm font-medium">{ATTRIBUTION_TAG}</code>
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
        </section>
      </main>

      <footer className="border-t border-slate-200 py-8 text-sm text-slate-500">
        <div className="mx-auto max-w-4xl px-6">
          <p>
            PayBridge — built for the{" "}
            <a
              href="https://www.loops.house/agents-open-for-business"
              target="_blank"
              rel="noopener"
              className="font-medium text-slate-800 hover:underline"
            >
              Celo Agents Open for Business
            </a>{" "}
            hackathon (Stablecoin Corridors track).
          </p>
          <p className="mt-2">
            <a
              href={`https://github.com/${GITHUB_REPO}`}
              target="_blank"
              rel="noopener"
              className="font-medium text-slate-800 hover:underline"
            >
              GitHub
            </a>
            {" · "}
            <a
              href="https://www.loops.house/agents-open-for-business"
              target="_blank"
              rel="noopener"
              className="font-medium text-slate-800 hover:underline"
            >
              Hackathon
            </a>
          </p>
          <p className="mt-2">© 2026 PayBridge</p>
        </div>
      </footer>
    </div>
  );
}
