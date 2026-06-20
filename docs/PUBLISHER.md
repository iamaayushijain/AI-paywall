# Publisher Guide — Protecting Your Content with `tollgate-sdk`

This guide covers everything a website owner needs: installing the SDK, gating content, configuring pricing, and accessing your payment dashboard.

---

## How it works in one paragraph

You drop two lines of middleware into your server. When an AI bot hits a protected route, the SDK detects it, returns HTTP 402 with a payment challenge, and blocks content delivery. The bot (if it has the agent SDK) pays the required USDC amount on Solana. Your server verifies the on-chain transaction and unlocks the content. The USDC goes directly to your Solana wallet — no intermediary, no platform cut, no signup.

---

## Prerequisites

- Node.js ≥ 18
- A Solana wallet address (this is where USDC payments land — it can be a cold wallet, you don't need the private key on the server)
- A Supabase project (for replay protection and analytics)

---

## Step 1 — Install

```bash
npm install tollgate-sdk
```

No other packages required on the publisher side. The SDK has zero Solana dependencies.

---

## Step 2 — Set up Supabase

The SDK uses Supabase Postgres for two things: replay protection (so the same transaction can't unlock content twice) and payment analytics (so you can see who paid, for what, and how much).

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the schema:

```sql
-- From supabase/schema.sql in this repo
create table if not exists public.payments (
  id              bigserial primary key,
  tx              text not null unique,
  wallet_address  text,
  network         text,
  bot_name        text,
  user_agent      text,
  path            text,
  lamports        bigint,
  relevance_score integer,
  content_type    text,
  timestamp       timestamptz not null default now()
);

create table if not exists public.verified_tx_cache (
  tx          text primary key,
  cached_at   timestamptz not null default now()
);
```

3. Add to your `.env`:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

---

## Step 3 — Set your wallet address

This is the only required config. Payments land at the USDC ATA derived from this address.

```bash
SOLANA_WALLET_ADDRESS=YourSolanaWalletAddress...
```

You do **not** need the private key on the server. The wallet address alone is enough to receive payments.

---

## Step 4 — Add the middleware

### Express

```js
import express from "express";
import { createPaywall } from "tollgate-sdk";
import { expressMiddleware } from "tollgate-sdk/express";

const paywall = createPaywall({
  walletAddress: process.env.SOLANA_WALLET_ADDRESS,
  network: "mainnet-beta",        // or "devnet" for testing
  protect: ["/articles/*", "/blog/*"], // only gate these paths
  basePriceMicroUsdc: 1_000,      // $0.001 per crawl (1000 micro-USDC = $0.001)
});

const app = express();
app.use(expressMiddleware(paywall));

// req.paywallPayment is set when a bot paid successfully
app.get("/articles/:slug", (req, res) => {
  res.json({ content: "Your article...", payment: req.paywallPayment });
});
```

### Next.js (App Router)

```ts
// middleware.ts (runs on the edge before any route)
import { createPaywall } from "tollgate-sdk";
import { paywallMiddleware } from "tollgate-sdk/nextjs";

const paywall = createPaywall({
  walletAddress: process.env.SOLANA_WALLET_ADDRESS!,
  basePriceMicroUsdc: 1_000,
});

export default paywallMiddleware(paywall);

export const config = { matcher: ["/articles/:path*", "/blog/:path*"] };
```

```ts
// app/articles/[slug]/route.ts
import { withRouteHandler } from "tollgate-sdk/nextjs";
import { paywall } from "@/lib/paywall"; // your shared instance

export const GET = withRouteHandler(paywall, async (req) => {
  return Response.json({ content: "Your article..." });
});
```

### Fastify

```js
import Fastify from "fastify";
import { createPaywall } from "tollgate-sdk";
import { fastifyPlugin } from "tollgate-sdk/fastify";

const paywall = createPaywall({ walletAddress: process.env.SOLANA_WALLET_ADDRESS });
const app = Fastify();
await app.register(fastifyPlugin, { paywall });
```

### Cloudflare Workers

```js
import { createPaywall } from "tollgate-sdk";
import { cloudflareHandler } from "tollgate-sdk/cloudflare";

export default {
  async fetch(request, env) {
    const paywall = createPaywall({ walletAddress: env.SOLANA_WALLET_ADDRESS });
    return cloudflareHandler(paywall, request, async () =>
      new Response(JSON.stringify({ content: "Your content" }), {
        headers: { "Content-Type": "application/json" },
      })
    );
  },
};
```

---

## Configuration reference

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `walletAddress` | ✓ | — | Your Solana wallet address. USDC payments land here. |
| `network` | — | `"devnet"` | `"devnet"` or `"mainnet-beta"` |
| `protect` | — | `["**/*"]` | Path globs or RegExp patterns to gate. Paths not matched pass through freely. |
| `basePriceMicroUsdc` | — | `1000` | Price per crawl in micro-USDC. `1000` = $0.001. `1_000_000` = $1.00. |
| `botScoreThreshold` | — | `70` | Composite score above which a request is classified as a bot. |
| `allowList` | — | `[]` | UA patterns that always pass as humans (e.g. `[{ pattern: /Googlebot/i }]`). |
| `failOpen` | — | `false` | If `true`, allow bots through when the facilitator is unreachable. If `false`, block them. |
| `onDetection(d)` | — | — | Hook called with the full detection object on every classified request. Useful for logging. |
| `apiUrl` | — | hosted | Override the facilitator URL (for self-hosting). |
| `timeoutMs` | — | `8000` | Network timeout for facilitator calls. |

---

## How bot detection works

The SDK runs a multi-signal composite score locally in-process — no network call for human visitors.

| Signal | Examples | Score contribution |
|--------|----------|--------------------|
| User-Agent match | GPTBot, ClaudeBot, PerplexityBot, Scrapy, python-requests | 55–90 pts |
| Missing browser headers | `accept-language`, `sec-fetch-site`, `sec-ch-ua` | 12 pts each |
| No `Accept: text/html` | Scripts rarely request HTML | 15 pts |
| Datacenter IP | AWS, GCP, Azure, Cloudflare CIDR ranges | 30 pts |
| Reverse DNS verification | Real Googlebot/ClaudeBot IPs resolve to known hostnames | Labelled as verified bot |

**Score ≥ 70** → bot, gated. **Score 40–69** → suspicious, passed through (configurable). **Score < 40** → human, always passed through with zero overhead.

---

## How pricing works

The server includes a relevance scorer that adjusts the base price based on:

- **Bot tier** — Training crawlers (CCBot, MetaAI: 2.7–2.8×) are priced higher than search indexers (Googlebot: 1.0×)
- **Content type** — Detected from path patterns (`/blog/` = prose, `/data/` = dataset, `/docs/` = technical) and body signals
- **Freshness** — Recently published content scores higher
- **Exclusivity** — `subscriber` or `proprietary` content commands a higher multiplier

The base price is `basePriceMicroUsdc`. The final price is:

```
final_price = base × bot_multiplier × content_affinity × exclusivity_mod × demand_mod
```

The 402 response exposes the full breakdown so agents can decide whether to pay:

```json
"crawlpay": {
  "relevance_score": 82,
  "content_type": "prose",
  "score_breakdown": { "affinity": 0.9, "richness": 1.1, "freshness": 1.0 },
  "modifiers": { "bot_multiplier": 2.5, "exclusivity_modifier": 1.0, "demand_modifier": 1.0 },
  "estimated_price": 2750
}
```

---

## Accessing your payment dashboard

The dashboard is at `/dashboard` (served by the backend). Authentication uses Sign-In With Solana — you prove ownership of the wallet by signing a server-issued message. No password, no email.

### Using the hosted UI

1. Open your backend URL + `/dashboard`
2. Click **Connect Wallet**
3. Sign the message in Phantom, Backpack, or any Solana wallet
4. You'll see payments scoped to your wallet — transaction signatures, bot names, paths, amounts, timestamps

### Fetching analytics via API (programmatic)

**Step 1: Request a nonce**

```bash
curl -X POST https://your-backend.com/v1/auth/nonce \
  -H "Content-Type: application/json" \
  -d '{"walletAddress": "YourSolanaWallet..."}'
```

Response:
```json
{
  "token": "<opaque-token>",
  "message": "your-domain.com wants you to sign in with your Solana account.\n\nWallet: YourSolanaWallet...\nNonce: abc123...\nIssued At: ...\nExpires At: ...",
  "expiresAt": "2026-05-11T12:05:00.000Z"
}
```

**Step 2: Sign the message**

Sign the `message` string with your wallet's private key. Using the Solana CLI:

```bash
# Using solana CLI — signs with ~/.config/solana/id.json
echo -n "your-domain.com wants you to sign in..." | \
  solana sign-offchain-message -
```

Or with `@solana/web3.js` in Node:

```js
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";

const keypair = Keypair.fromSecretKey(/* your secret key */);
const messageBytes = new TextEncoder().encode(message);
const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
const signatureBase58 = bs58.encode(signature);
```

**Step 3: Exchange for a session token**

```bash
curl -X POST https://your-backend.com/v1/auth/verify \
  -H "Content-Type: application/json" \
  -d '{
    "walletAddress": "YourSolanaWallet...",
    "message": "<exact message from step 1>",
    "signature": "<base58-encoded signature>",
    "token": "<token from step 1>"
  }'
```

Response:
```json
{
  "session": "<session-token>",
  "walletAddress": "YourSolanaWallet...",
  "expiresAt": "2026-05-12T12:00:00.000Z"
}
```

Sessions are valid for **24 hours**.

**Step 4: Fetch your analytics**

```bash
curl https://your-backend.com/v1/dashboard \
  -H "Authorization: Bearer <session-token>"
```

Response:
```json
{
  "wallet": { "address": "YourSolanaWallet..." },
  "total": 14,
  "total_lamports": 15200,
  "payments": [
    {
      "tx": "3jK9...",
      "botName": "GPTBot",
      "path": "/articles/ai-trends",
      "lamports": 2750,
      "timestamp": "2026-05-11T10:43:00Z"
    }
  ]
}
```

You can also use the `x-paywall-session` header instead of `Authorization: Bearer`:

```bash
curl https://your-backend.com/v1/dashboard \
  -H "x-paywall-session: <session-token>"
```

---

## Checking where your payments will land

Before going live, verify the USDC ATA (Associated Token Account) that payments will be sent to:

```bash
curl "https://your-backend.com/v1/wallet/treasury?walletAddress=YourWallet&network=mainnet-beta"
```

Response:
```json
{
  "walletAddress": "YourWallet...",
  "network": "mainnet-beta",
  "usdcMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "treasuryAta": "7xKpT..."
}
```

If the ATA doesn't exist yet, the facilitator will create it automatically on the first payment (funded by `FACILITATOR_FEE_PAYER_SECRET_KEY`). You can also create it yourself:

```bash
spl-token create-account EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v \
  --owner YourWallet... \
  --url mainnet-beta
```

---

## Environment variables

```bash
# Required
SOLANA_WALLET_ADDRESS=YourSolanaWallet...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Recommended
SOLANA_NETWORK=mainnet-beta                    # or "devnet"
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=...  # use a paid RPC in production

# Auth (generate with: openssl rand -hex 32)
PAYWALL_CHALLENGE_SECRET=<32-byte-hex>
PAYWALL_AUTH_SECRET=<32-byte-hex>
PAYWALL_AUTH_DOMAIN=yourdomain.com             # shown in the Sign-In message

# Optional (enables automatic USDC ATA creation for new wallets)
FACILITATOR_FEE_PAYER_SECRET_KEY=[...keypair-json-array...]
```

---

## Going to production checklist

- [ ] Switch `SOLANA_NETWORK` to `mainnet-beta`
- [ ] Use a paid RPC (Helius, QuickNode, Triton) — public endpoints rate-limit hard
- [ ] Set `PAYWALL_CHALLENGE_SECRET` and `PAYWALL_AUTH_SECRET` to fresh 32-byte secrets
- [ ] Set `PAYWALL_AUTH_DOMAIN` to your actual domain
- [ ] Run `supabase/schema.sql` on your production Supabase project
- [ ] Verify your treasury ATA exists on mainnet (`/v1/wallet/treasury`)
- [ ] Add `.env` to `.gitignore` — never commit secrets

---

## Troubleshooting

**Humans are being charged** — lower `botScoreThreshold` or check that browser `Accept` and `accept-language` headers are present on your site. Most static asset requests don't send browser headers, so only protect content routes.

**402 fires but payment always fails** — the treasury ATA may not exist. Hit `/v1/wallet/treasury` to confirm, then create it manually or ensure `FACILITATOR_FEE_PAYER_SECRET_KEY` is set.

**Dashboard returns 401** — session tokens expire in 24 hours. Repeat the sign-in flow to get a fresh session.

**Replay protection rejects a valid payment** — each transaction signature can only unlock content once. If you're testing, use a fresh transaction each time.
