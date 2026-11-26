"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { erc20Abi, formatUnits, isAddress, parseUnits, type Address, type Hex } from "viem";
import { formatDecimalAmount, formatTokenAmount } from "@/lib/format";
import {
  useAccount,
  useConnect,
  usePublicClient,
  useSignTypedData,
  useSwitchChain,
  useWalletClient,
} from "wagmi";
import { injected } from "wagmi/connectors";
import {
  ATTRIBUTION_TAG,
  CELOSCAN,
  CHAIN,
  TOKENS,
} from "@/lib/config";
import {
  CoinIcon,
  CoinPicker,
  SENDABLE_COINS,
  type CoinDef,
  type CoinKey,
} from "@/components/CoinPicker";
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

/**
 * Any of the 7 stablecoins can be the send currency and any (except the
 * send one) can be the receive currency. CELO is not in this set:
 * Textile has no CELO corridor on Celo mainnet (its preview answers
 * `corridor_unavailable`), so it cannot be sold through a quote.
 * USD₮ is a valid receive currency when the send is a local coin —
 * cNGN→USD₮ quotes, but local→local pairs have no corridor at all.
 */
type FlowCurrency = keyof typeof TOKENS;

/** Persisted send-currency choice (display preference only). */
const SEND_CURRENCY_KEY = "paybridge.sendCurrency";

function buildStepLabels(
  sellSymbol: string,
  buySymbol: string,
): Record<ExecStep, string> {
  return {
    approving: `Approve ${sellSymbol} spend`,
    swapping: `Swap ${sellSymbol} for ${buySymbol}`,
    confirming: "Confirm the swap filled",
    paying: "Pay the supplier",
    done: "Done",
  };
}

export function PayFlow({
  onPaymentDone,
  onBackToWallet,
}: {
  /** Called once when a payment completes, so the history preview can refresh. */
  onPaymentDone?: () => void;
  /**
   * Called instead of navigating home directly when the done panel's
   * "Back to wallet" is tapped — lets the hosting screen animate its
   * exit (e.g. slide back down) before leaving. Defaults to router.push("/").
   */
  onBackToWallet?: () => void;
}) {
  const { address, isConnected, chainId } = useAccount();
  const router = useRouter();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { signTypedDataAsync } = useSignTypedData();
  // Connect / network-switch actions for the pre-connect call-to-action
  // at the bottom of the form (see below).
  const { connect, isPending: isConnecting } = useConnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  const [supplier, setSupplier] = useState("");
  const [amount, setAmount] = useState("");
  // The send currency (default USD₮) and the receive currency. The
  // receive list always excludes the send coin; a local send can only
  // reach USD₮ (local→local corridors don't exist on Textile), so
  // switching the send side to a local resets receive to USD₮.
  const [sellCurrency, setSellCurrency] = useState<FlowCurrency>("USD_T");
  const [currency, setCurrency] = useState<FlowCurrency>("cNGN");
  const [sellPickerOpen, setSellPickerOpen] = useState(false);
  const [receivePickerOpen, setReceivePickerOpen] = useState(false);
  const [invoice, setInvoice] = useState("");
  const [stage, setStage] = useState<Stage>("form");
  const [execStep, setExecStep] = useState<ExecStep>("approving");
  const [error, setError] = useState<string | null>(null);
  const [fillPending, setFillPending] = useState(false);
  const [preview, setPreview] = useState<PreviewQuote | null>(null);
  const [firm, setFirm] = useState<RfqResponse | null>(null);
  // Decimals and balances for every sendable stablecoin, read on-chain
  // (never guessed) once the wallet connects. The picker rows and the
  // balance under the amount input read from these maps.
  const [allDecimals, setAllDecimals] = useState<
    Partial<Record<FlowCurrency, number>>
  >({});
  const [allBalances, setAllBalances] = useState<
    Partial<Record<FlowCurrency, bigint | null>>
  >({});
  const [celoBalance, setCeloBalance] = useState<bigint | null>(null);
  const [txs, setTxs] = useState<TxHashes>({});
  const [filledBuyAmount, setFilledBuyAmount] = useState<string | null>(null);
  const [attributionOk, setAttributionOk] = useState<boolean | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkingFill, setCheckingFill] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewNonce, setPreviewNonce] = useState(0);
  // Whether the on-chain token-details load (decimals + balances) has
  // finished. The live estimate cannot run until the selected coins'
  // decimals are known, and a transient RPC failure used to stall the
  // form forever with no message — so the form now says so and offers
  // a retry instead of stalling silently.
  const [tokenDetailsState, setTokenDetailsState] = useState<
    "idle" | "loading" | "done"
  >("idle");
  const tokenDetailsRunRef = useRef(0);

  const progressRef = useRef<{
    approvalHash: Hex | null;
    swapHash: Hex | null;
    payoutHash: Hex | null;
    submitted: boolean;
  }>({ approvalHash: null, swapHash: null, payoutHash: null, submitted: false });
  const reportedRef = useRef(false);
  const previewReqRef = useRef(0);
  const lastPreviewKeyRef = useRef("");
  // MAX auto-adjust: tracks whether the current amount came from tapping
  // MAX, how many times it has already been shrunk to fit the fee, and a
  // fresh copy of the selected send token's balance for the async preview
  // handler.
  const fromMaxRef = useRef(false);
  const maxAdjustCountRef = useRef(0);
  const sellBalanceRef = useRef<bigint | null>(null);

  const onCelo = isConnected && chainId === CHAIN.id;
  const ready = onCelo && !!address && !!publicClient && !!walletClient;

  // Selected coins and their on-chain data, derived from the maps.
  const sellCoin: CoinDef =
    SENDABLE_COINS.find((c) => c.key === sellCurrency) ?? SENDABLE_COINS[0];
  const receiveCoin: CoinDef =
    SENDABLE_COINS.find((c) => c.key === currency) ?? SENDABLE_COINS[1];
  const receiveCoins = SENDABLE_COINS.filter((c) => c.key !== sellCurrency);
  // 6 is only a display fallback before the on-chain read lands; the
  // preview never quotes until the real decimals are known (see below).
  const sellDecimals = allDecimals[sellCurrency] ?? 6;
  const buyDecimals = allDecimals[currency] ?? 6;
  const sellBalance = allBalances[sellCurrency] ?? null;

  // Hints for the silent stalls: the live estimate shows nothing at all
  // when the supplier address is invalid, the amount is below the 1-unit
  // minimum, or the selected coins' decimals never loaded — so the form
  // now says so under the relevant field instead of stalling silently.
  const supplierTrimmed = supplier.trim();
  const supplierIsOwnAddress =
    !!address && supplierTrimmed.toLowerCase() === address.toLowerCase();
  const supplierInvalid =
    supplierTrimmed !== "" &&
    (!isAddress(supplierTrimmed) || supplierIsOwnAddress);
  const amountTrimmed = amount.trim();
  const amountNum = Number(amountTrimmed);
  const amountBelowMin =
    /^\d+(\.\d+)?$/.test(amountTrimmed) &&
    !Number.isNaN(amountNum) &&
    amountNum > 0 &&
    amountNum < 1;
  const decimalsMissing =
    ready &&
    (allDecimals[sellCurrency] === undefined ||
      allDecimals[currency] === undefined);
  const inputsEntered = supplierTrimmed !== "" || amountTrimmed !== "";
  const tokenDetailsLoading =
    decimalsMissing && inputsEntered && tokenDetailsState !== "done";
  const tokenDetailsFailed =
    decimalsMissing && inputsEntered && tokenDetailsState === "done";

  // Load the persisted send currency on the client.
  useEffect(() => {
    try {
      const c = window.localStorage.getItem(SEND_CURRENCY_KEY);
      if (
        c &&
        (Object.keys(TOKENS) as FlowCurrency[]).includes(c as FlowCurrency)
      ) {
        setSellCurrency(c as FlowCurrency);
      }
    } catch {
      // Storage unavailable — the USD₮ default stands.
    }
  }, []);

  // Load token decimals + balances for every sendable stablecoin, plus
  // the native CELO balance for the gas warning. Decimals are read
  // on-chain, never guessed (IDRX, for example, is 2 decimals, not 6).
  // Gated on address: no chain RPC call happens before the user connects
  // their wallet — the form is disabled until then anyway.
  // Extracted as a callback so the "Couldn't load token details" retry
  // can re-run exactly the same load (decimals AND balances). A run id
  // drops stale responses when the wallet or client changes mid-load.
  const loadTokenDetails = useCallback(async () => {
    if (!publicClient || !address) return;
    const runId = ++tokenDetailsRunRef.current;
    setTokenDetailsState("loading");
    try {
      const keys = SENDABLE_COINS.map((c) => c.key as FlowCurrency);
      const [decList, balList, celoBal] = await Promise.all([
        Promise.all(
          keys.map((k) =>
            tokenDecimals(publicClient, TOKENS[k]).catch(() => null),
          ),
        ),
        Promise.all(
          keys.map((k) =>
            tokenBalance(publicClient, TOKENS[k], address).catch(() => null),
          ),
        ),
        publicClient.getBalance({ address }).catch(() => null),
      ]);
      if (tokenDetailsRunRef.current !== runId) return;
      const d: Partial<Record<FlowCurrency, number>> = {};
      const b: Partial<Record<FlowCurrency, bigint | null>> = {};
      keys.forEach((k, i) => {
        if (decList[i] !== null) d[k] = decList[i] as number;
        b[k] = balList[i];
      });
      setAllDecimals(d);
      setAllBalances(b);
      setCeloBalance(celoBal);
      setTokenDetailsState("done");
    } catch {
      // Balances are a convenience display; the flow re-checks before sending.
      if (tokenDetailsRunRef.current !== runId) return;
      setTokenDetailsState("done");
    }
  }, [publicClient, address]);

  useEffect(() => {
    if (!publicClient || !address) {
      setAllDecimals({});
      setAllBalances({});
      setCeloBalance(null);
      setTokenDetailsState("idle");
      return;
    }
    void loadTokenDetails();
  }, [publicClient, address, loadTokenDetails]);

  // Keep the sell-balance ref fresh for the async preview handler.
  useEffect(() => {
    sellBalanceRef.current = sellBalance;
  }, [sellBalance]);

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

  // Live estimate: fetch a preview quote automatically as the user types.
  // Only runs when the wallet is connected on Celo and the inputs are
  // valid. Invalid or incomplete input shows no estimate — the field
  // hints below the To / Amount fields, and the token-details line where
  // the estimate would appear, explain why instead of leaving the form
  // silent.
  useEffect(() => {
    // Any new run invalidates a preview fetch scheduled or in flight from a
    // previous run, so fast typing can never show a stale estimate.
    previewReqRef.current += 1;
    if (!ready || stage === "executing" || stage === "done") return;
    // Inputs changed while a firm quote was showing: that quote was for the
    // old inputs, so drop it and fall back to a live preview.
    if (stage === "confirm") {
      setFirm(null);
      setStage("preview");
      return;
    }
    const trimmedAmount = amount.trim();
    const n = Number(trimmedAmount);
    const inputsValid =
      isAddress(supplier) &&
      !(address && supplier.toLowerCase() === address.toLowerCase()) &&
      /^\d+(\.\d+)?$/.test(trimmedAmount) &&
      !Number.isNaN(n) &&
      n >= 1;
    if (!inputsValid) {
      setPreview(null);
      setPreviewLoading(false);
      if (stage === "preview") setStage("form");
      return;
    }
    // Decimals are read on-chain and arrive just after connecting; don't
    // quote until both are known, or an amount would be parsed with the
    // wrong scale (IDRX is 2 decimals, wFIAT tokens are 18). The form
    // shows "Loading token details…" while they load and a retry line if
    // the load finished without them, so this gate no longer stalls
    // silently.
    if (
      allDecimals[sellCurrency] === undefined ||
      allDecimals[currency] === undefined
    ) {
      setPreview(null);
      setPreviewLoading(false);
      return;
    }
    const key = `${supplier.toLowerCase()}|${trimmedAmount}|${sellCurrency}|${currency}|${sellDecimals}|${buyDecimals}`;
    if (key === lastPreviewKeyRef.current && preview) return;
    setPreviewLoading(true);
    const reqId = previewReqRef.current;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const sellAmount = parseUnits(trimmedAmount, sellDecimals);
          const p = await previewQuote({
            chainId: CHAIN.id,
            sellToken: TOKENS[sellCurrency],
            buyToken: TOKENS[currency],
            sellAmount: sellAmount.toString(),
          });
          if (previewReqRef.current !== reqId) return; // stale response
          if (!p) {
            setPreview(null);
            setStage("form");
            setError(
              "No quote available for this corridor right now — makers may be offline. Try again in a bit, or try a smaller amount.",
            );
            return;
          }
          // MAX auto-adjust: the amount came from MAX and the fee pushes
          // takerPays over the send balance, so shrink the amount to
          // (balance − fee) and let the debounced preview re-run with the
          // adjusted amount. At most 2 adjustments per MAX tap — after
          // that the fee-guard warning below takes over instead.
          const maxBalance = sellBalanceRef.current;
          if (
            fromMaxRef.current &&
            maxBalance !== null &&
            BigInt(p.takerPays) > maxBalance &&
            maxAdjustCountRef.current < 2
          ) {
            const adjusted = maxBalance - BigInt(p.feeAmount);
            const adjustedText = formatDecimalAmount(
              formatUnits(adjusted, sellDecimals),
            ).replace(/,/g, "");
            if (adjusted > 0n && Number(adjustedText) >= 1) {
              maxAdjustCountRef.current += 1;
              lastPreviewKeyRef.current = key;
              setError(null);
              setPreview(p);
              setStage("preview");
              setAmount(adjustedText);
              return;
            }
          }
          lastPreviewKeyRef.current = key;
          setError(null);
          setPreview(p);
          setStage("preview");
        } catch (err) {
          if (previewReqRef.current !== reqId) return;
          setError(friendlyError(err));
        } finally {
          if (previewReqRef.current === reqId) setPreviewLoading(false);
        }
      })();
    }, 600);
    return () => clearTimeout(timer);
  }, [supplier, amount, sellCurrency, currency, ready, sellDecimals, buyDecimals, stage, address, preview, previewNonce]);

  // MAX: fill the amount with the full balance of the selected send
  // currency. Clean, parseable number — at most 4 decimal places, no
  // thousands separators — so the live estimate picks it up exactly like
  // a typed value. The fee is deducted automatically once the preview
  // comes back (see the preview handler): if amount + fee exceeds the
  // balance, the amount is shrunk to (balance − fee) instead of warning.
  function fillMax() {
    if (sellBalance === null || sellBalance === 0n) return;
    fromMaxRef.current = true;
    maxAdjustCountRef.current = 0;
    const value = formatDecimalAmount(
      formatUnits(sellBalance, sellDecimals),
    ).replace(/,/g, "");
    setAmount(value);
  }

  function selectSellCurrency(c: FlowCurrency) {
    setSellCurrency(c);
    try {
      window.localStorage.setItem(SEND_CURRENCY_KEY, c);
    } catch {
      // Ignore storage failures.
    }
    // The receive coin must differ from the send coin. A local send can
    // only reach USD₮ (local→local corridors don't exist on Textile),
    // so it defaults the receive side to USD₮; a USD₮ send defaults
    // back to cNGN.
    if (currency === c) setCurrency(c === "USD_T" ? "cNGN" : "USD_T");
    setSellPickerOpen(false);
  }

  function selectReceiveCurrency(c: FlowCurrency) {
    setCurrency(c);
    setReceivePickerOpen(false);
  }

  async function getFirmQuote() {
    if (!address) return;
    // Auto-generate an invoice reference if the user left it blank.
    if (!invoice.trim()) setInvoice(`INV-${Date.now()}`);
    setError(null);
    setBusy(true);
    try {
      const sellAmount = parseUnits(amount, sellDecimals);
      const base = {
        chainId: CHAIN.id,
        sellToken: TOKENS[sellCurrency],
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
      // Fee guard: never proceed on a quote the wallet can't cover.
      if (sellBalance !== null && BigInt(rfq.quote.takerPays) > sellBalance) {
        throw new Error(
          "That amount plus the fee is more than your balance — lower the amount slightly.",
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
          TOKENS[sellCurrency],
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
    if (stage === "form" || stage === "preview") {
      // Preview fetch failed: fetch it again live; firm quote failed: ask again.
      if (preview) void getFirmQuote();
      else setPreviewNonce((n) => n + 1);
      return;
    }
    if (stage === "confirm") void getFirmQuote();
    else if (stage === "executing") void execute();
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
    fromMaxRef.current = false;
    maxAdjustCountRef.current = 0;
    reportedRef.current = false;
    progressRef.current = {
      approvalHash: null,
      swapHash: null,
      payoutHash: null,
      submitted: false,
    };
  }

  const quoteExpired = stage === "confirm" && secondsLeft !== null && secondsLeft <= 0;

  // Fee guard for the live estimate: the preview's takerPays is the exact
  // amount leaving the wallet and can sit slightly above the typed amount
  // because of the fee. If it exceeds the send balance, the user is warned
  // and cannot proceed to a firm quote on that amount.
  const takerPaysExceedsBalance =
    stage === "preview" &&
    preview !== null &&
    sellBalance !== null &&
    BigInt(preview.takerPays) > sellBalance;
  const steps: ExecStep[] = ["approving", "swapping", "confirming", "paying", "done"];
  const execIndex = steps.indexOf(execStep);
  const stepLabels = buildStepLabels(sellCoin.symbol, receiveCoin.symbol);

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
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
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
              disabled={!ready || busy}
              className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 font-mono text-sm text-slate-800 placeholder:text-slate-400 focus:border-green-600 focus:outline-none disabled:bg-slate-50"
            />
            {supplierInvalid && (
              <p className="mt-1 text-xs text-amber-700">
                {supplierIsOwnAddress
                  ? "That's your own address — enter your supplier's address."
                  : "Enter a valid supplier address (0x…)."}
              </p>
            )}
          </div>

          {/* Plain block children, NOT a grid wrapper: a single implicit
              `auto` grid column sizes to its content's min-content (the
              amount input's intrinsic size=20 width), so the track ran
              ~43px past the card's right edge and took MAX and "They
              receive" with it. Block boxes always fill the card width,
              so the amount row and receive button can no longer
              overflow. Spacing is unchanged: the form's space-y-4 gives
              the same 16px between these blocks as the grid's gap-4 did. */}
          <div>
            <label
              htmlFor="amount"
              className="block text-sm font-semibold text-slate-800"
            >
              Amount
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id="amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  // Any manual edit means the amount no longer came from
                  // MAX, so the fee is no longer deducted automatically.
                  fromMaxRef.current = false;
                  setAmount(e.target.value);
                }}
                placeholder="0.00"
                disabled={!ready || busy}
                className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3 text-lg font-semibold text-slate-800 focus:border-green-600 focus:outline-none disabled:bg-slate-50"
              />
              {/* Send currency — same MiniPay picker as the balance
                  card: logo + symbol, opens the bottom sheet. */}
              <button
                type="button"
                onClick={() => setSellPickerOpen(true)}
                disabled={!ready || busy}
                aria-haspopup="dialog"
                aria-expanded={sellPickerOpen}
                aria-label={`Send currency: ${sellCoin.symbol}. Tap to change.`}
                className="flex shrink-0 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-40"
              >
                <CoinIcon coin={sellCoin} size={24} />
                {sellCoin.symbol}
                {/* Small down-chevron, like the balance card's selector
                    row, so users can tell this opens a dropdown. */}
                <svg
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 text-slate-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={fillMax}
                disabled={
                  !ready || busy || sellBalance === null || sellBalance === 0n
                }
                className="shrink-0 rounded-xl border border-green-600 px-4 py-3 text-sm font-bold text-green-700 transition hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                MAX
              </button>
            </div>
            {sellBalance !== null && allDecimals[sellCurrency] !== undefined && (
              <p className="mt-1 text-xs text-slate-500">
                Balance: {formatTokenAmount(sellBalance, sellDecimals)}{" "}
                {sellCoin.symbol}
              </p>
            )}
            {amountBelowMin && (
              <p className="mt-1 text-xs text-amber-700">
                Minimum amount is 1.
              </p>
            )}
          </div>
          <div>
            <span className="block text-sm font-semibold text-slate-800">
              They receive
            </span>
            {/* Same MiniPay picker as the send side — the list always
                excludes the selected send currency. */}
            <button
              type="button"
              onClick={() => setReceivePickerOpen(true)}
              disabled={!ready || busy}
              aria-haspopup="dialog"
              aria-expanded={receivePickerOpen}
              aria-label={`Receive currency: ${receiveCoin.symbol}. Tap to change.`}
              className="mt-1 flex w-full min-w-0 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:bg-slate-50 disabled:opacity-60"
            >
              <CoinIcon coin={receiveCoin} size={24} />
              <span className="shrink-0">{receiveCoin.symbol}</span>
              <span className="min-w-0 flex-1 truncate font-normal text-slate-500">
                — {receiveCoin.name}
              </span>
              {/* Small down-chevron, like the balance card's selector
                  row, so users can tell this opens a dropdown. */}
              <svg
                aria-hidden="true"
                className="h-4 w-4 shrink-0 text-slate-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {celoBalance !== null && celoBalance === 0n && (
              <p className="mt-1 text-xs text-amber-700">
                Your CELO balance is 0 — you need a little CELO for gas.
              </p>
            )}
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
              disabled={!ready || busy}
              className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-green-600 focus:outline-none disabled:bg-slate-50"
            />
          </div>

          {previewLoading && (
            <p className="text-xs text-slate-500">Getting estimate…</p>
          )}

          {/* Token details are the estimate's missing piece: if the
              selected coins' decimals never loaded, the preview cannot
              run. Say so where the estimate would appear — a loading
              line while the load is in flight, and a retry line (which
              re-fetches decimals AND balances) once it has failed. */}
          {tokenDetailsLoading && (
            <p className="text-xs text-slate-500">Loading token details…</p>
          )}
          {tokenDetailsFailed && (
            <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
              <p className="font-medium">
                Couldn't load token details — the estimate can't run without
                them.
              </p>
              <button
                type="button"
                onClick={() => void loadTokenDetails()}
                className="mt-2 rounded-full bg-amber-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-amber-800"
              >
                Try again
              </button>
            </div>
          )}

          {/* Send and receive currency pickers — the same shared
              MiniPay sheet as the balance card. */}
          <CoinPicker
            open={sellPickerOpen}
            onClose={() => setSellPickerOpen(false)}
            coins={SENDABLE_COINS}
            selectedKey={sellCurrency}
            onSelect={(c) => selectSellCurrency(c as FlowCurrency)}
            balances={allBalances}
            decimals={allDecimals}
            title="Send currency"
          />
          <CoinPicker
            open={receivePickerOpen}
            onClose={() => setReceivePickerOpen(false)}
            coins={receiveCoins}
            selectedKey={currency}
            onSelect={(c) => selectReceiveCurrency(c as FlowCurrency)}
            balances={allBalances}
            decimals={allDecimals}
            title="They receive"
          />

          {/* A visible primary action at every stage: before a wallet is
              connected the form used to end after the Invoice field with
              nothing to tap, so the page looked dead. This starts the
              connect flow; on the wrong network it offers the switch
              instead. Once connected on Celo the quote flow below takes
              over and this button disappears. */}
          {(!isConnected || !onCelo) && (
            <div className="pt-2">
              {!isConnected ? (
                <button
                  type="button"
                  onClick={() => connect({ connector: injected() })}
                  disabled={isConnecting}
                  className="w-full rounded-full bg-green-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-green-700 disabled:opacity-50"
                >
                  {isConnecting ? "Connecting…" : "Connect wallet to send"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => switchChain({ chainId: CHAIN.id })}
                  disabled={isSwitching}
                  className="w-full rounded-full bg-amber-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:opacity-50"
                >
                  {isSwitching ? "Switching…" : "Switch to Celo mainnet"}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {stage === "preview" && preview && (
        <div className="mt-6 rounded-xl bg-slate-50 p-5">
          <p className="text-sm font-semibold text-slate-800">Estimate</p>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-slate-500">You spend</dt>
              <dd className="min-w-0 font-semibold text-slate-800">
                {formatTokenAmount(BigInt(preview.takerPays), sellDecimals)}{" "}
                {sellCoin.symbol}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-slate-500">Supplier receives (approx.)</dt>
              <dd className="min-w-0 font-semibold text-slate-800">
                {formatTokenAmount(BigInt(preview.buyAmount), buyDecimals)} {currency}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-slate-500">Fee</dt>
              <dd className="min-w-0 font-semibold text-slate-800">
                {formatTokenAmount(BigInt(preview.feeAmount), sellDecimals)}{" "}
                {sellCoin.symbol}
              </dd>
            </div>
            {rate !== null && (
              <div className="flex justify-between gap-4">
                <dt className="shrink-0 text-slate-500">Rate</dt>
                <dd className="min-w-0 font-semibold text-slate-800">
                  1 {sellCoin.symbol} ≈ {rate.toLocaleString(undefined, { maximumFractionDigits: 4 })} {currency}
                </dd>
              </div>
            )}
          </dl>
          <p className="mt-3 text-xs text-slate-500">
            This is an estimate. The firm quote locks the exact amounts.
          </p>
          {takerPaysExceedsBalance && (
            <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-medium text-amber-800">
              That amount plus the fee is more than your balance — lower the
              amount slightly.
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void getFirmQuote()}
              disabled={busy || takerPaysExceedsBalance}
              className="rounded-full bg-green-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-green-700 disabled:opacity-50"
            >
              {busy ? "Requesting firm quote… (up to ~70s)" : "Get firm quote"}
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
              <dt className="shrink-0 text-slate-500">You pay</dt>
              <dd className="min-w-0 font-semibold text-slate-800">
                {formatTokenAmount(BigInt(firm.quote.takerPays), sellDecimals)}{" "}
                {sellCoin.symbol}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-slate-500">Supplier receives</dt>
              <dd className="min-w-0 font-semibold text-slate-800">
                {formatTokenAmount(BigInt(firm.quote.buyAmount), buyDecimals)} {currency}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-slate-500">Fee</dt>
              <dd className="min-w-0 font-semibold text-slate-800">
                {formatTokenAmount(BigInt(firm.quote.feeAmount), sellDecimals)}{" "}
                {sellCoin.symbol}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-slate-500">Pay to</dt>
              <dd className="min-w-0 break-all font-mono text-xs font-medium text-slate-800">
                {supplier}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-slate-500">Invoice</dt>
              <dd className="min-w-0 break-all font-semibold text-slate-800">{invoice || "—"}</dd>
            </div>
            {rate !== null && (
              <div className="flex justify-between gap-4">
                <dt className="shrink-0 text-slate-500">Rate</dt>
                <dd className="min-w-0 font-semibold text-slate-800">
                  1 {sellCoin.symbol} ≈ {rate.toLocaleString(undefined, { maximumFractionDigits: 4 })} {currency}
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
                      {stepLabels[step]}
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
              <dt className="shrink-0 text-slate-500">You paid</dt>
              <dd className="min-w-0 font-semibold text-slate-800">
                {formatTokenAmount(BigInt(firm.quote.takerPays), sellDecimals)}{" "}
                {sellCoin.symbol}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-slate-500">Supplier received</dt>
              <dd className="min-w-0 font-semibold text-slate-800">
                {filledBuyAmount
                  ? formatTokenAmount(BigInt(filledBuyAmount), buyDecimals)
                  : formatTokenAmount(BigInt(firm.quote.buyAmount), buyDecimals)}{" "}
                {currency}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-slate-500">Fee</dt>
              <dd className="min-w-0 font-semibold text-slate-800">
                {formatTokenAmount(BigInt(firm.quote.feeAmount), sellDecimals)}{" "}
                {sellCoin.symbol}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-slate-500">Supplier</dt>
              <dd className="min-w-0 break-all font-mono text-xs font-medium text-slate-800">
                {supplier}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-slate-500">Invoice</dt>
              <dd className="min-w-0 break-all font-semibold text-slate-800">{invoice || "—"}</dd>
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
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={resetAll}
              className="rounded-full bg-green-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-green-700"
            >
              Make another payment
            </button>
            <button
              type="button"
              onClick={() => {
                if (onBackToWallet) onBackToWallet();
                else router.push("/");
              }}
              className="rounded-full border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Back to wallet
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
