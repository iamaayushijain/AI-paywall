# Agent Guide — Paying HTTP 402 Paywalls with `tollgate-agent-sdk`

This guide covers everything an AI agent builder needs: installing the SDK, configuring a signer, handling payments automatically, setting budget limits, integrating with LangChain, and handling errors.

---

## How it works in one paragraph

You replace `fetch()` with `client.fetch()`. When the target server returns HTTP 200, `client.fetch` is a pure passthrough — nothing changes. When it returns HTTP 402, the SDK reads the x402 payment envelope, validates it against your safety policy, builds and signs a USDC SPL token transfer on Solana, submits it on-chain, and retries the original request with the payment proof attached. The server verifies the on-chain transaction and returns 200 with the content. Your code sees the 200; the entire payment flow is invisible.

---

## Prerequisites

- Node.js ≥ 18
- A Solana wallet funded with:
  - Some SOL (for transaction fees — a few lamports per tx)
  - USDC (the token actually used for payments)
- On devnet, get both for free:
  - SOL: `solana airdrop 2 --url devnet`
  - USDC: [faucet.circle.com](https://faucet.circle.com) (devnet mint: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`)

---

## Step 1 — Install

```bash
npm install tollgate-agent-sdk \
  @solana/web3.js \
  @solana/spl-token \
  @x402-solana/core
```

The Solana and x402 packages are peer dependencies so your project stays in control of versions.

---

## Step 2 — Set up a signer

The SDK needs to sign Solana transactions. Pick whichever signer helper fits your setup:

### Keypair file (default Solana CLI location)

```js
import { createAgentPaywallClient, fromKeypairFile } from "tollgate-agent-sdk";

const client = createAgentPaywallClient({
  network: "devnet",
  signer: fromKeypairFile(), // reads ~/.config/solana/id.json
});
```

To use a different path:

```js
signer: fromKeypairFile("/path/to/your/keypair.json")
```

### Secret key as Uint8Array / JSON array

```js
import { fromSecretKeyArray } from "tollgate-agent-sdk";

// The JSON array format from `solana-keygen new --outfile key.json`
const secretKeyArray = JSON.parse(fs.readFileSync("key.json", "utf8"));
signer: fromSecretKeyArray(secretKeyArray)
```

### Secret key as base58 string (e.g. from an env var)

```js
import { fromSecretKeyBase58 } from "tollgate-agent-sdk";

signer: fromSecretKeyBase58(process.env.AGENT_WALLET_SECRET)
```

### Existing `@solana/web3.js` Keypair

```js
import { fromKeypair } from "tollgate-agent-sdk";
import { Keypair } from "@solana/web3.js";

const keypair = Keypair.generate(); // or however you get it
signer: fromKeypair(keypair)
```

### Custom signer (HSM, KMS, browser wallet, remote signing service)

```js
const signer = {
  publicKey: myPublicKey,           // @solana/web3.js PublicKey
  async signTransaction(tx) {       // signs in place and returns the tx
    await myKms.sign(tx);
    return tx;
  },
};
signer: signer
```

---

## Step 3 — Create the client

```js
import { createAgentPaywallClient, fromKeypairFile } from "tollgate-agent-sdk";

const client = createAgentPaywallClient({
  network: "devnet",               // "devnet" or "mainnet-beta"
  signer: fromKeypairFile(),

  // Safety guards (strongly recommended)
  maxAmountMicroUsdc: 10_000,      // refuse any single payment > $0.01
  maxTotalMicroUsdc: 1_000_000,    // stop paying after $1.00 total this session
});
```

---

## Step 4 — Make requests

```js
const res = await client.fetch("https://example.com/articles/ai-trends");
const data = await res.json();

// If a payment was made, the receipt is attached
if (res.paywallPayment) {
  console.log("Paid:", res.paywallPayment.signature);
  console.log("Amount:", res.paywallPayment.amountMicroUsdc, "micro-USDC");
}

// Running spend total for this client instance
console.log("Total spent:", client.spend());
```

`client.fetch` is signature-compatible with the global `fetch` — you can pass any `RequestInit` options (headers, body, method, etc.):

```js
const res = await client.fetch("https://example.com/api/data", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ query: "..." }),
});
```

---

## Configuration reference

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `network` | — | `"devnet"` | `"devnet"`, `"mainnet-beta"`, or `"testnet"` |
| `signer` | ✓ | — | Keypair or signer object. See signer helpers above. |
| `rpcUrl` | — | public endpoint | Override the Solana RPC URL. Use a paid endpoint in production. |
| `usdcMint` | — | canonical per network | Override the USDC mint address (rarely needed). |
| `maxAmountMicroUsdc` | — | unlimited | Hard cap per request. The SDK refuses to pay more than this. |
| `maxTotalMicroUsdc` | — | unlimited | Lifetime budget for this client instance. Throws when exceeded. |
| `allowedMints` | — | any | Restrict which USDC mints are acceptable. |
| `allowedRecipients` | — | any | Restrict which `payTo` ATAs are acceptable. |
| `autoPay` | — | `true` | If `false`, 402 responses pass through unchanged — the SDK will not pay automatically. |
| `userAgent` | — | `ai-paywall-agent-sdk/0.1` | User-Agent header sent with all requests. |
| `confirmCommitment` | — | `"confirmed"` | Solana commitment level for transaction confirmation. |
| `onChallenge(info)` | — | — | Hook called before each payment. Return `false` to refuse. |
| `onPayment(info)` | — | — | Hook called after each successful payment (for logging, persistence). |
| `fetchImpl` | — | `globalThis.fetch` | Custom fetch implementation. |

---

## Safety guards

The SDK will **refuse to sign** any payment that violates your policy. Checks happen before any SOL or USDC leaves the wallet:

| What's checked | How to configure |
|----------------|-----------------|
| Network mismatch (e.g. mainnet claim on devnet) | Automatic — always enforced |
| Amount exceeds per-request cap | `maxAmountMicroUsdc` |
| Cumulative spend exceeds session budget | `maxTotalMicroUsdc` |
| Asset mint not in your allowlist | `allowedMints` |
| Recipient ATA not in your allowlist | `allowedRecipients` |
| Programmatic approval | `onChallenge` hook — return `false` to block |
| Insufficient USDC balance | Automatic — checked before submission |

---

## Hooks

### `onChallenge` — approve or refuse before paying

```js
const client = createAgentPaywallClient({
  // ...
  onChallenge: async ({ url, amountMicroUsdc, envelope }) => {
    console.log(`About to pay ${amountMicroUsdc} micro-USDC for ${url}`);

    // Return false to refuse — no payment will be made
    if (amountMicroUsdc > 5_000) return false;

    return true; // or undefined — both mean "proceed"
  },
});
```

### `onPayment` — record each successful payment

```js
const client = createAgentPaywallClient({
  // ...
  onPayment: async ({ url, signature, amountMicroUsdc, payTo, network }) => {
    await db.insert({ url, signature, amountMicroUsdc, timestamp: new Date() });
  },
});
```

Errors thrown inside `onPayment` are silently swallowed so they don't break the response flow.

---

## Tracking spend

```js
const stats = client.spend();
// {
//   totalMicroUsdc: 4500,
//   count: 3,
//   payments: [
//     { signature: "3jK9...", amountMicroUsdc: 1000, url: "...", timestamp: ... },
//     ...
//   ]
// }
```

---

## Concurrent requests

If your agent fans out multiple parallel `client.fetch()` calls to the same URL and all get a 402 with the same nonce, the SDK coalesces them automatically — **one payment is sent, all callers receive the unlocked response**. You will never be double-charged for concurrent requests to the same resource.

---

## Error handling

All SDK errors extend `PaywallError` and have a `.code` string you can match on:

```js
import {
  PaymentRefusedError,
  PaymentBudgetExceededError,
  UnsupportedChallengeError,
  OnChainError,
  VerificationRejectedError,
} from "tollgate-agent-sdk";

try {
  const res = await client.fetch("https://example.com/article");
} catch (err) {
  if (err instanceof PaymentRefusedError) {
    // Policy refused: wrong network, mint, recipient, or amount too high
    // Do NOT retry — your policy explicitly blocked this.
    console.error("Refused:", err.message, err.details);

  } else if (err instanceof PaymentBudgetExceededError) {
    // Session budget exhausted — create a new client or stop.
    console.error("Budget exceeded");

  } else if (err instanceof UnsupportedChallengeError) {
    // The 402 response was malformed or uses an unsupported scheme.
    // May be a non-Tollgate paywall or a misconfigured server.
    console.error("Unsupported challenge:", err.message);

  } else if (err instanceof OnChainError) {
    // RPC failure, insufficient balance, or transaction rejected on-chain.
    console.error("On-chain error:", err.message);

  } else if (err instanceof VerificationRejectedError) {
    // Payment was submitted on-chain but the server still returned 402/403.
    // The funds were spent. Do not retry without investigation.
    console.error("Server rejected payment:", err.details);

  } else {
    throw err; // unrelated error, rethrow
  }
}
```

---

## LangChain integration

```js
import { createAgentPaywallClient, fromKeypairFile } from "tollgate-agent-sdk";
import { paywallFetchTool } from "tollgate-agent-sdk/langchain";
import { createOpenAIToolsAgent, AgentExecutor } from "langchain/agents";
import { ChatOpenAI } from "@langchain/openai";

const client = createAgentPaywallClient({
  network: "mainnet-beta",
  signer: fromKeypairFile(),
  maxAmountMicroUsdc: 5_000,
});

// Optional: restrict which hosts the tool is allowed to fetch
const tool = paywallFetchTool(client, {
  allowHost: (host) => host.endsWith("trusted-publisher.com"),
});

const llm = new ChatOpenAI({ model: "gpt-4o" });
const agent = await createOpenAIToolsAgent({ llm, tools: [tool], prompt });
const executor = AgentExecutor.fromAgentAndTools({ agent, tools: [tool] });

const result = await executor.invoke({
  input: "Fetch the article at https://trusted-publisher.com/articles/ai-2026",
});
```

The tool shape (`{ name, description, schema, invoke }`) is framework-neutral. If you're not using LangChain, map `schema` → `parameters` and call `tool.invoke(args)` from your own tool router.

### OpenAI function-calling (manual)

```js
const tool = paywallFetchTool(client);

// Register with OpenAI
const functions = [{ name: tool.name, description: tool.description, parameters: tool.schema }];

// When OpenAI calls it:
const result = await tool.invoke({ url: "https://...", method: "GET" });
```

---

## What's in `res.paywallPayment`

When a payment is made, the response has a non-enumerable `paywallPayment` property:

```js
{
  url: "https://example.com/article",
  signature: "3jK9xZ...",          // Solana transaction signature
  amountMicroUsdc: 1000,           // amount paid (1000 = $0.001)
  payTo: "7xKpT...",              // recipient's USDC ATA
  asset: "EPjFW...",              // USDC mint address used
  network: "mainnet-beta",
  challengeToken: "tok_9fK2...",  // echoed challenge from the 402
  xPayment: "<full header value>", // the raw X-PAYMENT header sent
}
```

Note: `paywallPayment` is `enumerable: false` so it doesn't show up in `JSON.stringify(res)`.

---

## Production checklist

- [ ] Switch `network` to `"mainnet-beta"`
- [ ] Use a paid RPC (`rpcUrl`) — Helius, QuickNode, or Triton
- [ ] Set `maxAmountMicroUsdc` — never leave this unlimited in production
- [ ] Set `maxTotalMicroUsdc` — cap total session spend
- [ ] Store your keypair securely — never commit it to source control
- [ ] Use `onPayment` to persist payment receipts to your database
- [ ] If using a custom signer (KMS/HSM), test it on devnet before mainnet
- [ ] Fund the agent wallet with enough USDC for expected session volume

---

## Troubleshooting

**"No fetch implementation available"** — Node < 18 doesn't have global `fetch`. Pass `fetchImpl: require("node-fetch")` or upgrade to Node 18+.

**`OnChainError`: insufficient USDC** — check the agent wallet's USDC balance. On devnet, use [faucet.circle.com](https://faucet.circle.com).

**`VerificationRejectedError` after successful on-chain tx** — the payment was submitted but the server rejected it. Possible causes: challenge token expired (>5 min), wrong amount, or the same signature was already used (replay). Investigate before retrying — the funds left the wallet.

**`PaymentRefusedError`: network mismatch** — your client is configured for `devnet` but the server is on `mainnet-beta` or vice versa. Match the `network` option to the server's network.

**Payments coalesce unexpectedly** — this is by design. For the same URL+nonce, multiple concurrent `client.fetch()` calls will share one payment. Create a new client instance if you need independent payment tracking per caller.
