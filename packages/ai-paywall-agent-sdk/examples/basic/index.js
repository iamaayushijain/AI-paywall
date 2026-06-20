/**
 * Basic agent example.
 *
 * Functionally equivalent to the repo's ~165-line `e2e-sdk-flow.js`, but
 * compressed to a single `client.fetch(url)` call. The SDK handles the 402,
 * builds + sends the USDC tx on Solana, mints the X-PAYMENT header, and
 * retries the request transparently.
 *
 * Run:
 *   node index.js
 *
 * Env:
 *   CONSUMER_URL          (default: http://localhost:4010)
 *   PROTECTED_PATH        (default: /articles/test)
 *   SOLANA_NETWORK        (default: devnet)
 *   SOLANA_RPC_URL        (optional)
 */

import "dotenv/config";
import {
  createAgentPaywallClient,
  fromKeypairFile,
} from "tollgate-agent-sdk";

const BASE_URL = process.env.CONSUMER_URL || "http://localhost:4010";
const PATH = process.env.PROTECTED_PATH || "/articles/test";

const client = createAgentPaywallClient({
  network: process.env.SOLANA_NETWORK || "devnet",
  rpcUrl: process.env.SOLANA_RPC_URL,
  signer: fromKeypairFile(),

  // Safety guards: never spend more than these caps no matter what the
  // server asks for. Tune to your agent's budget and risk tolerance.
  maxAmountMicroUsdc: 10_000,    // $0.01 per request
  maxTotalMicroUsdc: 1_000_000,  // $1.00 lifetime cap for this process

  userAgent: "GPTBot",

  onChallenge: ({ url, amountMicroUsdc }) => {
    console.log(`[paywall] ${url} → ${amountMicroUsdc} micro-USDC`);
    return true;
  },
  onPayment: ({ signature, amountMicroUsdc }) => {
    console.log(`[paywall] paid ${amountMicroUsdc} micro-USDC, sig=${signature}`);
  },
});

const res = await client.fetch(`${BASE_URL}${PATH}`);
console.log(`status: ${res.status}`);
console.log(`payer:  ${client.payerPublicKey.toString()}`);
console.log(`spend:  `, client.spend());
console.log(await res.json());
