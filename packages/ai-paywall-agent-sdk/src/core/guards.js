/**
 * Safety guards.
 *
 * Before signing any USDC transfer, the agent SDK validates that the 402
 * envelope it received matches the operator's policy. This is the layer
 * that prevents a malicious or misconfigured paywall from draining a wallet.
 *
 * Every check throws a typed error so callers can react precisely.
 */

import { PaymentRefusedError, UnsupportedChallengeError } from "./errors.js";

const X402_NETWORKS = new Set(["solana-devnet", "solana-mainnet", "solana-testnet"]);

export function networkFromX402(network) {
  if (network === "solana-mainnet") return "mainnet-beta";
  if (network === "solana-devnet") return "devnet";
  if (network === "solana-testnet") return "testnet";
  return null;
}

export function expectedX402Network(solanaNetwork) {
  return solanaNetwork === "mainnet-beta" ? "solana-mainnet" : `solana-${solanaNetwork}`;
}

/**
 * Validate the 402 envelope and resolve the accept entry the agent will pay.
 *
 * Returns: { accept, amountMicroUsdc, challengeToken }
 */
export function validateChallenge({
  envelope,
  config,
  url,
}) {
  if (!envelope || typeof envelope !== "object") {
    throw new UnsupportedChallengeError("Empty 402 body", { url });
  }

  const accepts = envelope.accepts;
  if (!Array.isArray(accepts) || accepts.length === 0) {
    throw new UnsupportedChallengeError(
      "402 envelope has no `accepts[]` entries the agent can fulfill",
      { url, envelope },
    );
  }

  const accept = accepts.find((a) => a?.scheme === "exact" && X402_NETWORKS.has(a?.network)) ||
    accepts[0];

  if (!accept || accept.scheme !== "exact") {
    throw new UnsupportedChallengeError(
      `Unsupported 402 scheme "${accept?.scheme}". Agent SDK supports x402 "exact" on Solana.`,
      { url, accept },
    );
  }
  if (!X402_NETWORKS.has(accept.network)) {
    throw new UnsupportedChallengeError(
      `Unsupported 402 network "${accept.network}".`,
      { url, accept },
    );
  }
  if (!accept.payTo) {
    throw new UnsupportedChallengeError("402 missing `payTo`", { url, accept });
  }
  if (!accept.asset) {
    throw new UnsupportedChallengeError("402 missing `asset` (USDC mint)", { url, accept });
  }
  if (accept.maxAmountRequired === undefined || accept.maxAmountRequired === null) {
    throw new UnsupportedChallengeError("402 missing `maxAmountRequired`", { url, accept });
  }

  const amountMicroUsdc = Number(accept.maxAmountRequired);
  if (!Number.isFinite(amountMicroUsdc) || amountMicroUsdc <= 0) {
    throw new UnsupportedChallengeError(
      `Invalid maxAmountRequired: ${accept.maxAmountRequired}`,
      { url, accept },
    );
  }

  const challengeToken = envelope?.crawlpay?.challenge?.token || null;

  // ── Operator policy checks ────────────────────────────────────────────
  const expectedX402 = expectedX402Network(config.network);
  if (accept.network !== expectedX402) {
    throw new PaymentRefusedError(
      `Refusing payment: 402 network "${accept.network}" does not match configured "${expectedX402}".`,
      { url, expected: expectedX402, got: accept.network },
    );
  }

  if (config.allowedMints && config.allowedMints.length > 0) {
    if (!config.allowedMints.includes(accept.asset)) {
      throw new PaymentRefusedError(
        `Refusing payment: asset mint ${accept.asset} not in allowedMints.`,
        { url, asset: accept.asset, allowedMints: config.allowedMints },
      );
    }
  }

  if (config.allowedRecipients && config.allowedRecipients.length > 0) {
    if (!config.allowedRecipients.includes(accept.payTo)) {
      throw new PaymentRefusedError(
        `Refusing payment: payTo ${accept.payTo} not in allowedRecipients.`,
        { url, payTo: accept.payTo, allowedRecipients: config.allowedRecipients },
      );
    }
  }

  if (config.maxAmountMicroUsdc !== undefined && config.maxAmountMicroUsdc !== null) {
    if (amountMicroUsdc > config.maxAmountMicroUsdc) {
      throw new PaymentRefusedError(
        `Refusing payment: ${amountMicroUsdc} micro-USDC exceeds maxAmountMicroUsdc (${config.maxAmountMicroUsdc}).`,
        { url, requested: amountMicroUsdc, max: config.maxAmountMicroUsdc },
      );
    }
  }

  return { accept, amountMicroUsdc, challengeToken };
}
