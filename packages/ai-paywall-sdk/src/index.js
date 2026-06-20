/**
 * tollgate-sdk — drop-in AI bot paywall.
 *
 * Quick start (Express):
 *   import { createPaywall } from "tollgate-sdk";
 *   import { expressMiddleware } from "tollgate-sdk/express";
 *
 *   const paywall = createPaywall({
 *     walletAddress: process.env.SOLANA_WALLET_ADDRESS,
 *     network: "devnet",
 *   });
 *   app.use("/articles", expressMiddleware(paywall));
 *
 * No API key. Payments land directly in your Solana wallet. Optional
 * dashboard analytics are unlocked by signing a message from that same
 * wallet (Sign-In With Solana).
 */

import { PaywallClient } from "./core/client.js";
import { runPaywall } from "./core/paywall.js";
import { detectBot } from "./core/botDetector.js";

/**
 * @typedef {object} PaywallConfig
 * @property {string} walletAddress           Solana wallet address that receives USDC payments.
 * @property {"devnet"|"mainnet-beta"|string} [network="devnet"] Solana network.
 * @property {string} [usdcMint]              Override USDC mint (defaults to canonical mint per network).
 * @property {string} [apiUrl]                Override facilitator URL (defaults to hosted service).
 * @property {Array<string|RegExp>} [protect] Path matchers; only matched paths are gated.
 * @property {number} [basePriceMicroUsdc=1000] Per-call price (1_000 = $0.001).
 * @property {number} [botScoreThreshold=70]  Threshold for bot classification.
 * @property {Array<{pattern: RegExp, name?: string}>} [allowList] Always-allow UA patterns.
 * @property {boolean} [failOpen=false]       If true, allow request through when facilitator is down.
 * @property {Function} [onDetection]         Hook called with the detection object.
 * @property {Function} [fetchImpl]           Custom fetch (e.g. for Cloudflare Workers).
 * @property {number} [timeoutMs=8000]        Network timeout for facilitator calls.
 */

function isLikelySolanaAddress(value) {
  if (typeof value !== "string") return false;
  if (value.length < 32 || value.length > 44) return false;
  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(value);
}

/**
 * Create a paywall instance from config.
 * The returned object is consumed by framework adapters.
 *
 * @param {PaywallConfig} config
 */
export function createPaywall(config) {
  if (!config || !config.walletAddress) {
    throw new Error(
      "createPaywall requires { walletAddress }. Pass your Solana wallet address — that's where USDC payments will land.",
    );
  }
  if (!isLikelySolanaAddress(config.walletAddress)) {
    throw new Error(
      `createPaywall: walletAddress "${config.walletAddress}" does not look like a valid Solana address (base58, 32-44 chars).`,
    );
  }

  const network = config.network || "devnet";

  const client = new PaywallClient({
    walletAddress: config.walletAddress,
    network,
    usdcMint: config.usdcMint,
    apiUrl: config.apiUrl,
    fetchImpl: config.fetchImpl,
    timeoutMs: config.timeoutMs,
  });

  const resolvedConfig = { ...config, network };

  return {
    config: resolvedConfig,
    client,
    /**
     * Manually evaluate a normalized request. Most users go through adapters.
     */
    run: (request) => runPaywall({ client, config: resolvedConfig, request }),
  };
}

export { detectBot };
