import Link from "next/link";
import { GITHUB_REPO } from "@/lib/config";

export function Footer() {
  return (
    <footer className="border-t border-slate-200 pb-28 pt-8 text-sm text-slate-500">
      <div className="mx-auto max-w-lg px-4">
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Link
            href="/how-it-works"
            className="font-medium text-slate-800 hover:underline"
          >
            How it works
          </Link>
          <a
            href={`https://github.com/${GITHUB_REPO}`}
            target="_blank"
            rel="noopener"
            className="font-medium text-slate-800 hover:underline"
          >
            GitHub
          </a>
          <a
            href="https://www.loops.house/agents-open-for-business"
            target="_blank"
            rel="noopener"
            className="font-medium text-slate-800 hover:underline"
          >
            Celo hackathon
          </a>
        </div>
        <p className="mt-3">
          PayBridge — built for the Celo Agents Open for Business hackathon
          (Stablecoin Corridors track).
        </p>
        <p className="mt-2">© 2026 PayBridge</p>
      </div>
    </footer>
  );
}
