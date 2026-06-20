# tollgate-sdk

Drop-in **AI bot paywall** for any Node-based web framework — fully wallet-based.

- **No API key, no signup.** Provide your Solana wallet address; payments land there directly.
- Local, low-latency bot detection (no network call required for humans)
- Automatic `HTTP 402` x402 envelopes for known AI/scraper UAs
- On-chain USDC verification via a stateless x402 facilitator
- Adapters for **Express**, **Next.js**, **Fastify**, **Cloudflare Workers**
- Optional dashboard analytics, unlocked by signing a message from your wallet (Sign-In With Solana)
- Zero Solana dependencies on your server

## 60-second setup

```bash
npm install tollgate-sdk
```

Set your wallet address (this is where USDC lands; nothing else is required):

```bash
c"YourSolanaWallet..."
```

That's it. No tenant onboarding, no API key issuance, no admin tokens.

## Usage

### Express

```js
import express from "express";
import { createPaywall } from "tollgate-sdk";
import { expressMiddleware } from "tollgate-sdk/express";

const paywall = createPaywall({
  walletAddress: process.env.SOLANA_WALLET_ADDRESS,
  network: "devnet",
  protect: ["/articles/*", "/blog/*"],
  basePriceMicroUsdc: 1_000,
});

const app = express();
app.use(expressMiddleware(paywall));

app.get("/articles/:slug", (req, res) => {
  res.json({ paid: true, payment: req.paywallPayment });
});
```

### Next.js

```ts
// middleware.ts
import { createPaywall } from "tollgate-sdk";
import { paywallMiddleware } from "tollgate-sdk/nextjs";

const paywall = createPaywall({
  walletAddress: process.env.SOLANA_WALLET_ADDRESS,
});
export default paywallMiddleware(paywall);

export const config = { matcher: ["/articles/:path*"] };
```

App Router route handler:

```ts
import { withRouteHandler } from "tollgate-sdk/nextjs";
export const GET = withRouteHandler(paywall, async () =>
  Response.json({ paid: true })
);
```

### Fastify

```js
import Fastify from "fastify";
import { createPaywall } from "tollgate-sdk";
import { fastifyPlugin } from "tollgate-sdk/fastify";

const paywall = createPaywall({
  walletAddress: process.env.SOLANA_WALLET_ADDRESS,
});
const app = Fastify();
await app.register(fastifyPlugin, { paywall });
```

### Cloudflare Workers

```js
import { createPaywall } from "tollgate-sdk";
import { cloudflareHandler } from "tollgate-sdk/cloudflare";

export default {
  async fetch(request, env) {
    const paywall = createPaywall({
      walletAddress: env.SOLANA_WALLET_ADDRESS,
    });
    return cloudflareHandler(paywall, request, async () =>
      new Response("Premium content")
    );
  },
};
```

## Configuration

| Option                 | Default               | Description                                              |
|------------------------|-----------------------|----------------------------------------------------------|
| `walletAddress`        | required              | Your Solana wallet address — receives USDC payments.     |
| `network`              | `"devnet"`            | `"devnet"` or `"mainnet-beta"`.                          |
| `usdcMint`             | canonical per network | Override USDC mint (rarely needed).                      |
| `apiUrl`               | hosted facilitator    | Override facilitator endpoint.                           |
| `protect`              | `["**/*"]`            | Path matchers (`string` glob with `*` or `RegExp`).      |
| `basePriceMicroUsdc`   | `1000`                | Per-call price (1_000 = $0.001).                         |
| `botScoreThreshold`    | `70`                  | Minimum score to classify as bot.                        |
| `allowList`            | `[]`                  | UA patterns that always pass as humans.                  |
| `failOpen`             | `false`               | If true, allow request when facilitator is unreachable.  |
| `onDetection(d)`       | -                     | Hook fired with bot-detection result.                    |
| `fetchImpl`            | `globalThis.fetch`    | Custom fetch (e.g. for older Node, sandboxes).           |
| `timeoutMs`            | `8000`                | Network timeout for facilitator calls.                   |

## How it works

1. Request hits your server.
2. SDK runs **local** UA + header detection.
3. If not a bot → request flows through, no network call.
4. If bot + no payment → SDK calls `/v1/challenge` (declaring your wallet) → returns **HTTP 402** with x402 envelope (price, payTo = your wallet's USDC ATA, asset, signed challenge token bound to your wallet).
5. Bot retries with `X-PAYMENT` header (and echoes the challenge token).
6. SDK calls `/v1/verify` → facilitator checks transaction on Solana, validates the
   challenge binding, prevents replay, optionally records the payment for your dashboard.
7. Verified → request flows through. `req.paywallPayment` exposes payment metadata.

The facilitator never holds your funds and never custodies your keys. Payments
go directly from the bot's wallet to yours, on-chain.

## Dashboard (optional)

Visit the hosted dashboard, click **Connect Wallet**, sign the nonce with your
Solana wallet (Phantom, Backpack, etc.), and you'll see analytics scoped to
your wallet — payments received, top bots, top paid pages.

You can also fetch dashboard data programmatically:

```bash
# 1. Get a nonce
curl -X POST https://api.ai-paywall.dev/v1/auth/nonce \
  -H 'content-type: application/json' \
  -d '{"walletAddress":"YourSolanaWallet..."}'

# 2. Sign the returned `message` with your wallet, then exchange for a session token
curl -X POST https://api.ai-paywall.dev/v1/auth/verify \
  -H 'content-type: application/json' \
  -d '{"walletAddress":"YourSolanaWallet...","message":"<message>","signature":"<base58 sig>"}'

# 3. Fetch your analytics
curl https://api.ai-paywall.dev/v1/dashboard \
  -H "Authorization: Bearer <sessionToken>"
```

## License

MIT
