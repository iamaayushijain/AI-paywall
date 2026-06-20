/**
 * Agent paywall client.
 *
 *   const client = createAgentPaywallClient({ network, signer, ...guards });
 *   const res = await client.fetch(url, init);
 *
 * On a `200` (or any non-402 response), `client.fetch` is a passthrough
 * over `globalThis.fetch`. On a `402` from an `tollgate-sdk`-compatible
 * server, it:
 *
 *   1. parses the x402 envelope and the `crawlpay.challenge.token`
 *   2. validates the envelope against the operator's policy (network, mint,
 *      payTo allowlist, max amount)
 *   3. builds + signs + submits a USDC transfer with the configured signer
 *   4. mints the matching `X-PAYMENT` header
 *   5. retries the original request with `X-PAYMENT` and `x-paywall-challenge`
 *   6. returns the unlocked `Response`, with the payment metadata attached
 *      as a non-enumerable `paywallPayment` property
 *
 * Concurrent requests for the same URL+nonce coalesce so the agent never
 * pays twice.
 */

import { PublicKey } from "@solana/web3.js";

import { validateChallenge } from "./guards.js";
import {
  assertPayerCanCover,
  buildAndSubmitPayment,
  makeConnection,
} from "./payment.js";
import { resolveSigner } from "./signer.js";
import { createSpendTracker } from "./spendTracker.js";
import {
  PaywallError,
  UnsupportedChallengeError,
  VerificationRejectedError,
} from "./errors.js";

const DEFAULT_USER_AGENT = "ai-paywall-agent-sdk/0.1";
const PAYMENT_HEADER = "X-PAYMENT";
const CHALLENGE_HEADER = "x-paywall-challenge";

function mergeHeaders(base, extra) {
  const out = new Headers(base || {});
  for (const [k, v] of Object.entries(extra || {})) {
    if (v !== undefined && v !== null) out.set(k, String(v));
  }
  return out;
}

async function readEnvelope(response) {
  const ct = response.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return null;
  try {
    return await response.clone().json();
  } catch {
    return null;
  }
}

function attachPayment(response, payment) {
  Object.defineProperty(response, "paywallPayment", {
    value: payment,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return response;
}

/**
 * @typedef {object} AgentPaywallConfig
 * @property {"devnet"|"mainnet-beta"|"testnet"|string} network
 * @property {object} signer                                - Keypair or signer object (see ./signer.js)
 * @property {string} [rpcUrl]                              - Override Solana RPC
 * @property {string} [usdcMint]                            - Override USDC mint
 * @property {number} [maxAmountMicroUsdc]                  - Per-request cap (recommended)
 * @property {number} [maxTotalMicroUsdc]                   - Lifetime cap for this client
 * @property {string[]} [allowedMints]                      - Restrict accepted asset mints
 * @property {string[]} [allowedRecipients]                 - Restrict accepted payTo ATAs
 * @property {boolean} [autoPay=true]                       - If false, surfaces 402 instead of paying
 * @property {string} [userAgent]                           - User-Agent for requests (defaults to ai-paywall-agent-sdk)
 * @property {string} [confirmCommitment="confirmed"]       - Solana commitment for tx confirmation
 * @property {(envelope:object)=>boolean|Promise<boolean>} [onChallenge]  - Approval hook (return false to refuse)
 * @property {(payment:object)=>void|Promise<void>} [onPayment]           - Fired after each successful payment
 * @property {Function} [fetchImpl]                         - Custom fetch (default globalThis.fetch)
 */

/**
 * @param {AgentPaywallConfig} input
 */
export function createAgentPaywallClient(input) {
  if (!input || typeof input !== "object") {
    throw new Error("createAgentPaywallClient: config object is required");
  }
  const network = input.network || "devnet";
  const signer = resolveSigner(input.signer);
  const fetchImpl = input.fetchImpl || globalThis.fetch;
  if (!fetchImpl) {
    throw new Error("No fetch implementation available. Provide fetchImpl.");
  }

  const config = {
    network,
    rpcUrl: input.rpcUrl,
    usdcMint: input.usdcMint,
    maxAmountMicroUsdc: input.maxAmountMicroUsdc ?? null,
    maxTotalMicroUsdc: input.maxTotalMicroUsdc ?? null,
    allowedMints: input.allowedMints || null,
    allowedRecipients: input.allowedRecipients || null,
    autoPay: input.autoPay !== false,
    userAgent: input.userAgent || DEFAULT_USER_AGENT,
    confirmCommitment: input.confirmCommitment || "confirmed",
    onChallenge: input.onChallenge || null,
    onPayment: input.onPayment || null,
  };

  const connection = makeConnection({
    rpcUrl: config.rpcUrl,
    network: config.network,
    commitment: config.confirmCommitment,
  });

  const tracker = createSpendTracker({ maxTotalMicroUsdc: config.maxTotalMicroUsdc });

  async function rawFetch(url, init = {}) {
    const headers = mergeHeaders(init.headers, {
      "User-Agent": init.headers?.["User-Agent"] || init.headers?.["user-agent"] || config.userAgent,
    });
    return fetchImpl(url, { ...init, headers });
  }

  /**
   * Pay a parsed challenge and return the headers needed to retry.
   * Surfaced for callers who want to drive the flow themselves.
   */
  async function payChallenge({ envelope, url }) {
    const { accept, amountMicroUsdc, challengeToken } = validateChallenge({
      envelope,
      config,
      url,
    });

    if (config.onChallenge) {
      const ok = await config.onChallenge({
        url,
        envelope,
        accept,
        amountMicroUsdc,
        challengeToken,
      });
      if (ok === false) {
        throw new PaywallError(
          "CHALLENGE_REJECTED_BY_HOOK",
          "onChallenge returned false; refusing to pay.",
          { url, amountMicroUsdc },
        );
      }
    }

    tracker.assertBudget(amountMicroUsdc);

    await assertPayerCanCover({
      connection,
      payerPublicKey: signer.publicKey,
      usdcMint: new PublicKey(accept.asset),
      amountMicroUsdc,
    });

    const { signature, xPayment } = await buildAndSubmitPayment({
      connection,
      signer,
      accept,
      amountMicroUsdc,
      commitment: config.confirmCommitment,
    });

    tracker.record({ amountMicroUsdc, signature });

    const payment = {
      url,
      signature,
      amountMicroUsdc,
      payTo: accept.payTo,
      asset: accept.asset,
      network: accept.network,
      challengeToken,
      xPayment,
    };

    if (config.onPayment) {
      try {
        await config.onPayment(payment);
      } catch {
        /* user hook errors swallowed to avoid breaking the request flow */
      }
    }

    return payment;
  }

  /**
   * Drop-in `fetch` replacement that auto-pays 402s.
   *
   * Returns a normal `Response`. If a payment was made, `response.paywallPayment`
   * is the payment object (signature, amount, etc).
   */
  async function fetchWithPayment(url, init = {}) {
    const first = await rawFetch(url, init);
    if (first.status !== 402) return first;
    if (!config.autoPay) return first;

    const envelope = await readEnvelope(first);
    if (!envelope) {
      throw new UnsupportedChallengeError(
        "Got 402 but the body was not a JSON x402 envelope.",
        { url, status: first.status },
      );
    }

    const dedupeKey = `${url}|${envelope?.crawlpay?.challenge?.nonce || ""}`;
    const payment = await tracker.coalesce(dedupeKey, () =>
      payChallenge({ envelope, url }),
    );

    const retryHeaders = mergeHeaders(init.headers, {
      "User-Agent": init.headers?.["User-Agent"] || init.headers?.["user-agent"] || config.userAgent,
      [PAYMENT_HEADER]: payment.xPayment,
      [CHALLENGE_HEADER]: payment.challengeToken,
    });

    const second = await fetchImpl(url, { ...init, headers: retryHeaders });

    if (second.status === 402 || second.status === 403) {
      throw new VerificationRejectedError(
        `Server rejected payment with status ${second.status}.`,
        { url, status: second.status, signature: payment.signature },
      );
    }

    return attachPayment(second, payment);
  }

  return {
    config,
    payerPublicKey: signer.publicKey,
    fetch: fetchWithPayment,
    fetchWithPayment,
    payChallenge,
    spend: () => tracker.stats(),
  };
}
