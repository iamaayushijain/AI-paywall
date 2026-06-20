/**
 * tollgate-agent-sdk — turnkey 402 paywall client for AI agents.
 *
 * Quick start:
 *
 *   import { createAgentPaywallClient, fromKeypairFile } from "tollgate-agent-sdk";
 *
 *   const client = createAgentPaywallClient({
 *     network: "devnet",
 *     signer: fromKeypairFile(),       // or fromKeypair(kp), or a custom signer
 *     maxAmountMicroUsdc: 10_000,      // never pay more than $0.01 per request
 *     maxTotalMicroUsdc: 1_000_000,    // and never more than $1 in this process
 *   });
 *
 *   const res = await client.fetch("https://example.com/articles/test");
 *   const data = await res.json();
 *
 *   console.log("paid:", res.paywallPayment?.signature);
 *   console.log("spend:", client.spend());
 */

export { createAgentPaywallClient } from "./core/client.js";

export {
  fromKeypair,
  fromSecretKeyArray,
  fromSecretKeyBase58,
  fromKeypairFile,
  resolveSigner,
} from "./core/signer.js";

export {
  PaywallError,
  PaymentRefusedError,
  PaymentBudgetExceededError,
  UnsupportedChallengeError,
  OnChainError,
  VerificationRejectedError,
} from "./core/errors.js";
