"use client";

import { useEffect, useRef, useState } from "react";
import { erc20Abi, formatUnits, isAddress, parseUnits, type Address, type Hex } from "viem";
import {
  useAccount,
  usePublicClient,
  useSignTypedData,
  useWalletClient,
} from "wagmi";
import {
  ATTRIBUTION_TAG,
  CELOSCAN,
  CHAIN,
  LOCAL_STABLECOIN_LABELS,
  LOCAL_STABLECOINS,
  TOKENS,
  type LocalStablecoin,
} from "@/lib/config";
import {
  approveIfNeeded,
  executeSwap,
  getTaggedWalletClient,
  paySupplier,
  tokenBalance,
  tokenDecimals,
  verifyAttribution,
} from "@/lib/execute";
import {
  getRfqStatus,
  newTakerControlNonce,
  previewQuote,
  requestFirmQuote,
  submitTx,
  TAKER_CONTROL_DOMAIN,
  TAKER_CONTROL_TYPES,
  type PreviewQuote,
  type RfqResponse,
} from "@/lib/textile";

type Stage = "form" | "preview" | "confirm" | "executing" | "done";
type ExecStep = "approving" | "swapping" | "confirming" | "paying" | "done";

interface TxHashes {
  approvalReset?: Hex;
  approval?: Hex;
  swap?: Hex;
  payout?: Hex;
}

function friendlyError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/rejected|denied|user cancelled/i.test(message)) {
    return "You rejected the request in your wallet. Nothing was sent.";
  }
  if (/timeout|timed out/i.test(message)) {
    return "The request timed out — please try again.";
  }
  if (/insufficient/i.test(message)) {
    return message;
  }
  return message.length > 220 ? `${message.slice(0, 220)}…` : message;
}

function TxLink({ hash, label }: { hash: Hex; label: string }) {
  return (
    <a
      href={`${CELOSCAN}/tx/${hash}`}
      target="_blank"
      rel="noopener"
      className="font-mono text-xs font-medium break-all text-green-700 hover:underline"
    >
      {label}: {hash.slice(0, 10)}…{hash.slice(-6)} ↗
    </a>
  );
}

const STEP_LABELS: Record<ExecStep, string> = {
  approving: "Approve USD₮ spend",
  swapping: "Swap USD₮ for local stablecoin",
  confirming: "Confirm the swap filled",
  paying: "Pay the supplier",
  done: "Done",
};

export function PayFlow({
  onPaymentDone,
}: {
  /** Called once when a payment completes, so the history preview can refresh. */
  onPaymentDone?: () => void;
}) {
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { signTypedDataAsync } = useSignTypedData();

  const [supplier, setSupplier] = useState("");
  const [amount, setAmount] = useState("50");
  const [currency, setCurrency] = useState<LocalStablecoin>("cNGN");
  const [invoice, setInvoice] = useState("");
  const [stage, setStage] = useState<Stage>("form");
  const [execStep, setExecStep] = useState<ExecStep>("approving");
  const [error, setError] = useState<string | null>(null);
  const [fillPending, setFillPending] = useState(false);
  const [preview, setPreview] = useState<PreviewQuote | null>(null);
  const [firm, setFirm] = useState<RfqResponse | null>(null);
  const [sellDecimals, setSellDecimals] = useState(6);
  const [buyDecimals, setBuyDecimals] = useState(6);
  const [usdtBalance, setUsdtBalance] = useState<bigint | null>(null);
  const [celoBalance, setCeloBalance] = useState<bigint | null>(null);
  const [txs, setTxs] = useState<TxHashes>({});
  const [filledBuyAmount, setFilledBuyAmount] = useState<string | null>(null);
  const [attributionOk, setAttributionOk] = useState<boolean | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkingFill, setCheckingFill] = useState(false);

  const progressRef = useRef<{
    approvalHash: Hex | null;
    swapHash: Hex | null;
    payoutHash: Hex | null;
    submitted: boolean;
  }>({ approvalHash: null, swapHash: null, payoutHash: null, submitted: false });
  const reportedRef = useRef(false);

  const onCelo = isConnected && chainId === CHAIN.id;
  const ready = onCelo && !!address && !!publicClient && !!walletClient;

  // Token decimals + balances (decimals are read on-chain, never guessed).
  // Gated on address: no chain RPC call happens before the user connects
  // their wallet — the form is disabled until then anyway.
  useEffect(() => {
    if (!publicClient || !address) return;
    let cancelled = false;
    (async () => {
      try {
        const [sd, bd] = await Promise.all([
          tokenDecimals(publicClient, TOKENS.USD_T),
          tokenDecimals(publicClient, TOKENS[currency]),
        ]);
        if (!cancelled) {
          setSellDecimals(sd);
          setBuyDecimals(bd);
        }
      } catch {
        // Keep the known defaults (USD₮ 6, cNGN 6); the quote still carries
        // the authoritative amounts.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicClient, currency, address]);

  useEffect(() => {
    if (!publicClient || !address) {
      setUsdtBalance(null);
      setCeloBalance(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [u, c] = await Promise.all([
          tokenBalance(publicClient, TOKENS.USD_T, address),
          publicClient.getBalance({ address }),
        ]);
        if (!cancelled) {
          setUsdtBalance(u);
          setCeloBalance(c);
        }
      } catch {
        // Balances are a convenience display; the flow re-checks before sending.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicClient, address]);

  // Firm-quote expiry countdown.
  useEffect(() => {
    if (stage !== "confirm" || !firm?.quote) {
      setSecondsLeft(null);
      return;
    }
    const tick = () => {
      const left = Math.max(
        0,
        Math.floor((Date.parse(firm.quote!.expiresAt) - Date.now()) / 1000),
      );
      setSecondsLeft(left);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [stage, firm]);

  function validateForm(): string | null {
    if (!isAddress(supplier)) return "Enter a valid supplier wallet address (0x…).";
    if (address && supplier.toLowerCase() === address.toLowerCase()) {
      return "The supplier address is your own wallet — enter the supplier's address.";
    }
    const n = Number(amount);
    if (!amount || Number.isNaN(n) || n <= 0) return "Enter an amount in USD₮.";
    if (n < 1) return "Minimum is about $1.";
    return null;
  }

  async function getEstimate() {
    const problem = validateForm();
    if (problem) {
      setError(problem);
      return;
    }
    // Auto-generate an invoice reference if the user left it blank.
    if (!invoice.trim()) setInvoice(`INV-${Date.now()}`);
    setError(null);
    setBusy(true);
    try {
      const sellAmount = parseUnits(amount, sellDecimals);
      const p = await previewQuote({
        chainId: CHAIN.id,
        sellToken: TOKENS.USD_T,
        buyToken: TOKENS[currency],
        sellAmount: sellAmount.toString(),
      });
      if (!p) {
        setError(
          "No quote available for this corridor right now — makers may be offline. Try again in a bit, or try a smaller amount.",
        );
        return;
      }
      setPreview(p);
      setStage("preview");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function getFirmQuote() {
    if (!address) return;
    setError(null);
    setBusy(true);
    try {
      const sellAmount = parseUnits(amount, sellDecimals);
      const base = {
        chainId: CHAIN.id,
        sellToken: TOKENS.USD_T,
        buyToken: TOKENS[currency],
        sellAmount: sellAmount.toString(),
        taker: address,
      };
      let { rfq, needsProof } = await requestFirmQuote(base);
      if (needsProof) {
        // Textile wants proof you control the taker wallet — sign the
        // TakerControl message in your wallet, then retry with the proof.
        const nonce = newTakerControlNonce();
        const issuedAt = Date.now();
        const signature = await signTypedDataAsync({
          domain: TAKER_CONTROL_DOMAIN,
          types: TAKER_CONTROL_TYPES,
          primaryType: "TakerControl",
          message: {
            taker: address,
            chainId: BigInt(CHAIN.id),
            nonce,
            issuedAt: BigInt(issuedAt),
          },
        });
        ({ rfq, needsProof } = await requestFirmQuote({
          ...base,
          takerProof: { nonce, issuedAt, signature },
        }));
        if (needsProof) {
          throw new Error("Textile still needs a proof of wallet control — please try again.");
        }
      }
      if (rfq.status === "no_quote" || !rfq.quote || !rfq.transactions) {
        throw new Error(
          `No firm quote right now${rfq.reason ? `: ${rfq.reason}` : ""}. Try a smaller amount or try again shortly.`,
        );
      }
      setFirm(rfq);
      setStage("confirm");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function runPayout(buyAmountRaw: string) {
    if (!publicClient || !walletClient || !firm) return;
    setExecStep("paying");
    const tagged = getTaggedWalletClient(walletClient);
    const payoutHash = await paySupplier(
      publicClient,
      tagged,
      TOKENS[currency],
      supplier as Address,
      BigInt(buyAmountRaw),
      address!,
    );
    progressRef.current.payoutHash = payoutHash;
    setTxs((t) => ({ ...t, payout: payoutHash }));
    const codes = await verifyAttribution(publicClient, progressRef.current.swapHash!);
    setAttributionOk(!!codes && codes.includes(ATTRIBUTION_TAG));
    setExecStep("done");
    setStage("done");
    if (!reportedRef.current && firm.quote) {
      reportedRef.current = true;
      onPaymentDone?.();
    }
  }

  async function checkFillAgain() {
    if (!firm) return;
    setError(null);
    setFillPending(false);
    setCheckingFill(true);
    try {
      const status = await getRfqStatus({
        rfqId: firm.rfqId,
        claimToken: firm.claimToken,
      });
      if (status.status === "filled") {
        setFilledBuyAmount(status.buyAmount);
        await runPayout(status.buyAmount);
      } else {
        setFillPending(true);
        setError(
          `Swap still not confirmed filled (status: ${status.status}). You can check again — your swapped ${currency} is safe in your wallet.`,
        );
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setCheckingFill(false);
    }
  }

  async function execute() {
    if (!firm?.quote || !firm.transactions || !address || !walletClient || !publicClient) return;
    setError(null);
    setFillPending(false);
    setBusy(true);
    setStage("executing");
    const tagged = getTaggedWalletClient(walletClient);
    const sellAmount = BigInt(firm.quote.takerPays);
    try {
      // 1. Approval — must confirm before the swap is broadcast.
      if (!progressRef.current.approvalHash) {
        setExecStep("approving");
        const { resetHash, hash } = await approveIfNeeded(
          publicClient,
          tagged,
          TOKENS.USD_T,
          address,
          sellAmount,
          address,
        );
        if (resetHash) setTxs((t) => ({ ...t, approvalReset: resetHash }));
        if (hash) {
          progressRef.current.approvalHash = hash;
          setTxs((t) => ({ ...t, approval: hash }));
        }
      }
      // 2. Swap — broadcast exactly what Textile returned.
      if (!progressRef.current.swapHash) {
        setExecStep("swapping");
        const swapHash = await executeSwap(tagged, firm.quote, firm.transactions.swap, address);
        progressRef.current.swapHash = swapHash;
        setTxs((t) => ({ ...t, swap: swapHash }));
        await publicClient.waitForTransactionReceipt({ hash: swapHash });
      }
      // 3. Report the hash, then wait for Textile to confirm the fill.
      setExecStep("confirming");
      if (!progressRef.current.submitted) {
        try {
          await submitTx({
            rfqId: firm.rfqId,
            claimToken: firm.claimToken,
            txHash: progressRef.current.swapHash!,
          });
          progressRef.current.submitted = true;
        } catch {
          // Best effort — the fill poll below still works.
        }
      }
      let status = await getRfqStatus({
        rfqId: firm.rfqId,
        claimToken: firm.claimToken,
      });
      let tries = 0;
      while (status.status !== "filled" && tries < 30) {
        await new Promise((r) => setTimeout(r, 3000));
        status = await getRfqStatus({
          rfqId: firm.rfqId,
          claimToken: firm.claimToken,
        });
        tries++;
      }
      if (status.status !== "filled") {
        setFillPending(true);
        throw new Error(
          `Swap was sent but the fill is not confirmed yet (status: ${status.status}). Your swapped ${currency} is in your wallet — check again below instead of starting over.`,
        );
      }
      setFilledBuyAmount(status.buyAmount);
      // 4. Payout in the local stablecoin.
      await runPayout(status.buyAmount);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  function retry() {
    setError(null);
    if (fillPending) {
      void checkFillAgain();
      return;
    }
    if (stage === "preview") void getFirmQuote();
    else if (stage === "confirm") void getFirmQuote();
    else if (stage === "executing") void execute();
    else void getEstimate();
  }

  function resetAll() {
    setStage("form");
    setExecStep("approving");
    setError(null);
    setFillPending(false);
    setPreview(null);
    setFirm(null);
    setTxs({});
    setFilledBuyAmount(null);
    setAttributionOk(null);
    reportedRef.current = false;
    progressRef.current = {
      approvalHash: null,
      swapHash: null,
      payoutHash: null,
      submitted: false,
    };
  }

  const quoteExpired = stage === "confirm" && secondsLeft !== null && secondsLeft <= 0;
  const steps: ExecStep[] = ["approving", "swapping", "confirming", "paying", "done"];
  const execIndex = steps.indexOf(execStep);

  const rate =
    preview || firm?.quote
      ? Number(
          formatUnits(
            BigInt((preview ?? firm!.quote!).buyAmount),
            buyDecimals,
          ),
        ) /
        Number(
          formatUnits(
            BigInt((preview ?? firm!.quote!).sellAmount),
            sellDecimals,
          ),
        )
      : null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <h2 className="text-xl font-bold text-slate-800">Send payment</h2>
      <p className="mt-1 text-sm text-slate-500">
        Pay a supplier in their local stablecoin. You pay from your own
        wallet on Celo mainnet — nothing is sent until you approve each step
        in your wallet.
      </p>

      {!isConnected && (
        <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
          Connect your wallet above to start a payment.
        </div>
      )}

      {isConnected && !onCelo && (
        <div className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
          Your wallet is on the wrong network. Switch to Celo mainnet to
          continue.
        </div>
      )}

      {error && (
        <div className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold">Something went wrong</p>
          <p className="mt-1">{error}</p>
          <button
            type="button"
            onClick={retry}
            disabled={busy || checkingFill}
            className="mt-3 rounded-full bg-red-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-red-800 disabled:opacity-50"
          >
            {checkingFill ? "Checking…" : busy ? "Working…" : "Try again"}
          </button>
        </div>
      )}

      {(stage === "form" || stage === "preview" || stage === "confirm") && (
        <div className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="supplier"
              className="block text-sm font-semibold text-slate-800"
            >
              To
            </label>
            <input
              id="supplier"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value.trim())}
              placeholder="0x…"
              disabled={!ready || stage !== "form" || busy}
              className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 font-mono text-sm text-slate-800 placeholder:text-slate-400 focus:border-green-600 focus:outline-none disabled:bg-slate-50"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="amount"
                className="block text-sm font-semibold text-slate-800"
              >
                Amount
              </label>
              <input
                id="amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={!ready || stage !== "form" || busy}
                className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-lg font-semibold text-slate-800 focus:border-green-600 focus:outline-none disabled:bg-slate-50"
              />
              {usdtBalance !== null && (
                <p className="mt-1 text-xs text-slate-500">
                  Balance: {formatUnits(usdtBalance, sellDecimals)} USD₮
                </p>
              )}
            </div>
            <div>
              <label
                htmlFor="currency"
                className="block text-sm font-semibold text-slate-800"
              >
                They receive
              </label>
              <select
                id="currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as LocalStablecoin)}
                disabled={!ready || stage !== "form" || busy}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 focus:border-green-600 focus:outline-none disabled:bg-slate-50"
              >
                {LOCAL_STABLECOINS.map((c) => (
                  <option key={c} value={c}>
                    {LOCAL_STABLECOIN_LABELS[c]}
                  </option>
                ))}
              </select>
              {celoBalance !== null && celoBalance === 0n && (
                <p className="mt-1 text-xs text-amber-700">
                  Your CELO balance is 0 — you need a little CELO for gas.
                </p>
              )}
            </div>
          </div>

          <div>
            <label
              htmlFor="invoice"
              className="block text-sm font-semibold text-slate-800"
            >
              Invoice reference <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              id="invoice"
              value={invoice}
              onChange={(e) => setInvoice(e.target.value)}
              placeholder="Auto-generated if left blank"
              disabled={!ready || stage !== "form" || busy}
              className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-green-600 focus:outline-none disabled:bg-slate-50"
            />
          </div>

          {stage === "form" && (
            <button
              type="button"
              onClick={() => void getEstimate()}
              disabled={!ready || busy}
              className="w-full rounded-full bg-green-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-green-700 disabled:opacity-50"
            >
              {busy ? "Getting estimate…" : "Get estimate"}
            </button>
          )}
        </div>
      )}

      {stage === "preview" && preview && (
        <div className="mt-6 rounded-xl bg-slate-50 p-5">
          <p className="text-sm font-semibold text-slate-800">Estimate</p>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">You spend</dt>
              <dd className="font-semibold text-slate-800">
                {formatUnits(BigInt(preview.takerPays), sellDecimals)} USD₮
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Supplier receives (approx.)</dt>
              <dd className="font-semibold text-slate-800">
                {formatUnits(BigInt(preview.buyAmount), buyDecimals)} {currency}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Fee</dt>
              <dd className="font-semibold text-slate-800">
                {formatUnits(BigInt(preview.feeAmount), sellDecimals)} USD₮
              </dd>
            </div>
            {rate !== null && (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Rate</dt>
                <dd className="font-semibold text-slate-800">
                  1 USD₮ ≈ {rate.toLocaleString(undefined, { maximumFractionDigits: 4 })} {currency}
                </dd>
              </div>
            )}
          </dl>
          <p className="mt-3 text-xs text-slate-500">
            This is an estimate. The firm quote locks the exact amounts.
          </p>
          <div className="mt-4 rounded-xl bg-green-50 p-4 text-xs leading-relaxed text-green-900">
            <p className="font-semibold">About the next step</p>
            <p className="mt-1">
              Your wallet will ask you to sign a message proving you control
              this wallet. A signature cannot move your funds — it only proves
              ownership to Textile so they give you a firm quote. You can
              reject it safely and nothing happens.
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void getFirmQuote()}
              disabled={busy}
              className="rounded-full bg-green-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-green-700 disabled:opacity-50"
            >
              {busy ? "Requesting firm quote… (up to ~70s)" : "Get firm quote"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStage("form");
                setPreview(null);
                setError(null);
              }}
              disabled={busy}
              className="rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Edit
            </button>
          </div>
        </div>
      )}

      {stage === "confirm" && firm?.quote && firm.transactions && (
        <div className="mt-6 rounded-xl border border-green-600 bg-green-50 p-5">
          <p className="text-sm font-semibold text-slate-800">
            Firm quote — check everything before you confirm
          </p>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">You pay</dt>
              <dd className="font-semibold text-slate-800">
                {formatUnits(BigInt(firm.quote.takerPays), sellDecimals)} USD₮
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Supplier receives</dt>
              <dd className="font-semibold text-slate-800">
                {formatUnits(BigInt(firm.quote.buyAmount), buyDecimals)} {currency}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Fee</dt>
              <dd className="font-semibold text-slate-800">
                {formatUnits(BigInt(firm.quote.feeAmount), sellDecimals)} USD₮
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Pay to</dt>
              <dd className="font-mono text-xs font-medium break-all text-slate-800">
                {supplier}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Invoice</dt>
              <dd className="font-semibold text-slate-800">{invoice || "—"}</dd>
            </div>
            {rate !== null && (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Rate</dt>
                <dd className="font-semibold text-slate-800">
                  1 USD₮ ≈ {rate.toLocaleString(undefined, { maximumFractionDigits: 4 })} {currency}
                </dd>
              </div>
            )}
          </dl>
          <p className="mt-3 text-xs text-slate-500">
            {quoteExpired
              ? "This quote has expired — request a new one."
              : secondsLeft !== null
                ? `Quote expires in ${secondsLeft}s. The approval, swap and payout will each ask you to confirm in your wallet.`
                : "The approval, swap and payout will each ask you to confirm in your wallet."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void execute()}
              disabled={busy || quoteExpired}
              className="rounded-full bg-green-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-green-700 disabled:opacity-50"
            >
              {busy ? "Working…" : "Confirm & pay"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStage("preview");
                setFirm(null);
                setError(null);
              }}
              disabled={busy}
              className="rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {stage === "executing" && (
        <div className="mt-6">
          <ol className="space-y-3">
            {steps.map((step, i) => {
              const done = i < execIndex || step === "done" && execStep === "done";
              const active = step === execStep && execStep !== "done";
              const stepHash =
                step === "approving"
                  ? txs.approval
                  : step === "swapping"
                    ? txs.swap
                    : step === "paying"
                      ? txs.payout
                      : undefined;
              return (
                <li key={step} className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      done
                        ? "bg-green-600 text-white"
                        : active
                          ? "bg-green-100 text-green-700"
                          : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {done ? "✓" : i + 1}
                  </span>
                  <div className="min-w-0">
                    <p
                      className={`text-sm font-semibold ${
                        done || active ? "text-slate-800" : "text-slate-400"
                      }`}
                    >
                      {STEP_LABELS[step]}
                      {active && busy ? "…" : ""}
                    </p>
                    {stepHash && <TxLink hash={stepHash} label="Transaction" />}
                    {step === "approving" && txs.approvalReset && (
                      <p>
                        <TxLink hash={txs.approvalReset} label="Allowance reset" />
                      </p>
                    )}
                    {step === "confirming" && fillPending && (
                      <button
                        type="button"
                        onClick={() => void checkFillAgain()}
                        disabled={checkingFill}
                        className="mt-2 rounded-full bg-green-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-green-700 disabled:opacity-50"
                      >
                        {checkingFill ? "Checking…" : "Check fill status again"}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="mt-4 text-xs text-slate-500">
            Every transaction carries the PayBridge attribution tag{" "}
            <code className="font-mono">{ATTRIBUTION_TAG}</code>.
          </p>
        </div>
      )}

      {stage === "done" && firm?.quote && (
        <div className="mt-6 rounded-xl border border-green-600 bg-green-50 p-5">
          <p className="text-lg font-bold text-slate-800">Payment sent ✓</p>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">You paid</dt>
              <dd className="font-semibold text-slate-800">
                {formatUnits(BigInt(firm.quote.takerPays), sellDecimals)} USD₮
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Supplier received</dt>
              <dd className="font-semibold text-slate-800">
                {filledBuyAmount
                  ? formatUnits(BigInt(filledBuyAmount), buyDecimals)
                  : formatUnits(BigInt(firm.quote.buyAmount), buyDecimals)}{" "}
                {currency}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Fee</dt>
              <dd className="font-semibold text-slate-800">
                {formatUnits(BigInt(firm.quote.feeAmount), sellDecimals)} USD₮
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Supplier</dt>
              <dd className="font-mono text-xs font-medium break-all text-slate-800">
                {supplier}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Invoice</dt>
              <dd className="font-semibold text-slate-800">{invoice || "—"}</dd>
            </div>
          </dl>
          <div className="mt-4 space-y-1.5">
            {txs.approval && <TxLink hash={txs.approval} label="Approval" />}
            {txs.swap && <TxLink hash={txs.swap} label="Swap" />}
            {txs.payout && <TxLink hash={txs.payout} label="Payout" />}
          </div>
          {attributionOk === true && (
            <p className="mt-3 text-xs font-semibold text-green-700">
              ✓ Attribution tag verified on-chain.
            </p>
          )}
          {attributionOk === false && (
            <p className="mt-3 text-xs text-amber-700">
              The tag was included in every transaction — it could not be
              verified on this swap automatically. Check the swap transaction
              on Celoscan.
            </p>
          )}
          <button
            type="button"
            onClick={resetAll}
            className="mt-5 rounded-full bg-green-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-green-700"
          >
            Make another payment
          </button>
        </div>
      )}
    </div>
  );
}
