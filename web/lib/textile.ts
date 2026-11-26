import type { Address, Hex } from "viem";
import { CHAIN } from "./config";

/**
 * Textile FX RFQ API v2 — types and browser-side helpers.
 * Ported from the CLI in ../src/textile.ts. The API calls themselves go
 * through the Next.js routes in app/api/rfq/* (server-side proxy) so the
 * browser never hits Textile directly and CORS is never an issue.
 *
 * Flow: preview (free estimate) -> request (firm quote, blocks up to ~70 s;
 * client timeout 75 s) -> approve -> swap -> submit tx hash -> payout.
 * A firm request is bound to one `taker` wallet. Keyless callers prove
 * control with a TakerControl EIP-712 signature; the server asks for it
 * only when Textile answers 401 proof_of_control_required.
 */

export interface Quote {
  sellAmount: string;
  buyAmount: string;
  feeAmount: string;
  takerPays: string;
  rateRay: string;
  expiresAt: string;
  orderDeadline: string;
  latestOrderDeadline: string;
  reactor: Address;
  encodedOrder: Hex;
  signature: Hex;
  orders: Array<{
    encodedOrder: Hex;
    signature: Hex;
    sellAmount: string;
    buyAmount: string;
    feeAmount: string;
    maker: Address;
  }>;
}

export interface RfqResponse {
  rfqId: string;
  claimToken: string;
  status: "quoted" | "no_quote" | "preview";
  quote?: Quote;
  transactions?: {
    approval: { to: Address; data: Hex; value: string; chainId: number };
    swap: { to: Address; data: Hex; value: string; chainId: number };
  };
  reason?: string;
  availableSellAmount?: string;
  availableBuyAmount?: string;
  reservedUntil?: string;
  retryAfterMs?: number;
}

export interface RfqStatus {
  rfqId: string;
  status:
    | "soliciting"
    | "quoted"
    | "no_quote"
    | "submitted"
    | "filled"
    | "failed"
    | "expired";
  sellAmount: string;
  buyAmount: string;
  feeAmount: string;
  taker: Address;
  txHash?: string | null;
  failReason?: string | null;
}

export interface PreviewQuote {
  sellAmount: string;
  buyAmount: string;
  feeAmount: string;
  takerPays: string;
  rateRay: string;
  availableSellAmount?: string;
}

export interface TakerProof {
  nonce: Hex;
  issuedAt: number;
  signature: Hex;
}

/** EIP-712 TakerControl domain and types — must match Textile exactly. */
export const TAKER_CONTROL_DOMAIN = {
  name: "Textile Taker Control",
  version: "1",
  chainId: CHAIN.id,
} as const;

export const TAKER_CONTROL_TYPES = {
  TakerControl: [
    { name: "taker", type: "address" },
    { name: "chainId", type: "uint256" },
    { name: "nonce", type: "bytes32" },
    { name: "issuedAt", type: "uint256" },
  ],
} as const;

export function newTakerControlNonce(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}` as Hex;
}

async function api<T>(path: string, body: unknown, timeoutMs = 30_000): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: T;
    error?: string;
    reason?: string;
  };
  if (!res.ok) {
    const err = new Error(json.error ?? `Request failed: ${res.status}`) as Error & {
      status?: number;
      reason?: string;
    };
    err.status = res.status;
    err.reason = json.reason;
    throw err;
  }
  return json.data as T;
}

/** Free estimate — no wallet or signature needed. Returns null on no_quote. */
export async function previewQuote(args: {
  chainId: number;
  sellToken: Address;
  buyToken: Address;
  sellAmount?: string;
  buyAmount?: string;
}): Promise<PreviewQuote | null> {
  const data = await api<{ status: string } & PreviewQuote>(
    "/api/rfq/preview",
    args,
    30_000,
  );
  if (data.status === "no_quote") return null;
  return data;
}

export interface FirmQuoteResult {
  rfq: RfqResponse;
  /** True when Textile asked for a TakerControl proof — caller must sign and retry. */
  needsProof: boolean;
}

/**
 * Firm quote. The server sends unsigned first; if Textile answers 401
 * proof_of_control_required, this returns needsProof: true and the caller
 * signs the TakerControl message and retries with the proof.
 */
export async function requestFirmQuote(args: {
  chainId: number;
  sellToken: Address;
  buyToken: Address;
  sellAmount?: string;
  buyAmount?: string;
  taker: Address;
  takerProof?: TakerProof;
}): Promise<FirmQuoteResult> {
  try {
    const rfq = await api<RfqResponse>("/api/rfq/request", args, 75_000);
    return { rfq, needsProof: false };
  } catch (err) {
    const e = err as Error & { status?: number; reason?: string };
    if (e.status === 401 && e.reason === "proof_of_control_required") {
      return { rfq: null as unknown as RfqResponse, needsProof: true };
    }
    throw err;
  }
}

/** Report the broadcast swap hash so Textile reconciles the fill. */
export async function submitTx(args: {
  rfqId: string;
  claimToken: string;
  txHash: Hex;
}): Promise<RfqStatus> {
  return api<RfqStatus>("/api/rfq/submit", args, 30_000);
}

/** Poll the RFQ until it is filled (or fails / expires). */
export async function getRfqStatus(args: {
  rfqId: string;
  claimToken: string;
}): Promise<RfqStatus> {
  const params = new URLSearchParams(args);
  const res = await fetch(`/api/rfq/status?${params}`, {
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: RfqStatus;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? `Status failed: ${res.status}`);
  return json.data as RfqStatus;
}
