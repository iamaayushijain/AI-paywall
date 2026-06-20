import Link from "next/link";
import { ArrowRight, Server } from "lucide-react";
import { DocLayout } from "@/components/docs/doc-layout";
import {
  DocSection,
  DocSubSection,
  DocP,
  DocCode,
  DocTable,
  DocBadge,
  DocCallout,
} from "@/components/docs/doc-components";

const SECTIONS = [
  { id: "overview",     label: "Overview" },
  { id: "install",      label: "Installation" },
  { id: "quickstart",   label: "Quick Start" },
  { id: "express",      label: "  Express" },
  { id: "nextjs",       label: "  Next.js" },
  { id: "fastify",      label: "  Fastify" },
  { id: "cloudflare",   label: "  Cloudflare Workers" },
  { id: "config",       label: "Configuration" },
  { id: "bot-detection",label: "Bot Detection" },
  { id: "pricing",      label: "Dynamic Pricing" },
  { id: "dashboard",    label: "Dashboard & Auth" },
  { id: "env",          label: "Environment Variables" },
];

export const metadata = {
  title: "Publisher SDK — Tollgate Docs",
  description: "Drop-in HTTP 402 paywall for Express, Next.js, Fastify, and Cloudflare Workers.",
};

export default function PublisherDocsPage() {
  return (
    <DocLayout sdk="publisher" sections={SECTIONS}>
      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
            <Server className="w-4 h-4 text-accent" />
          </div>
          <span className="section-label">Publisher SDK</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-ink tracking-tight">
          tollgate-sdk
        </h1>
        <p className="mt-3 text-inkMuted max-w-2xl">
          Drop-in AI bot paywall for Express, Next.js, Fastify, and Cloudflare Workers.
          Provide your Solana wallet address — USDC payments land there directly. No API key, no signup, no custodian.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/docs/agent"
            className="inline-flex items-center gap-1.5 text-sm text-inkMuted hover:text-ink transition-colors"
          >
            Looking for the Agent SDK? <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      <div className="space-y-0">

        {/* Overview */}
        <DocSection id="overview" title="Overview">
          <DocP>
            Tollgate intercepts HTTP requests at the middleware layer. When it detects an AI bot,
            it returns HTTP 402 with an x402 payment envelope — the bot's wallet address, price in USDC,
            and a signed challenge token. Human visitors pass through with zero overhead.
          </DocP>
          <DocP>
            On retry with a valid <DocBadge>X-PAYMENT</DocBadge> header, the SDK verifies the on-chain
            USDC transfer via Solana RPC and unlocks content. Replay protection is enforced via Supabase.
          </DocP>
          <DocCallout>
            <strong className="text-accent">No private key on the server.</strong> You only provide your
            wallet address. USDC flows from the agent&apos;s wallet directly to your ATA on-chain.
          </DocCallout>
        </DocSection>

        {/* Install */}
        <DocSection id="install" title="Installation">
          <DocCode lang="bash">{`npm install tollgate-sdk`}</DocCode>
          <DocP>
            Zero Solana dependencies on your server — the SDK handles all on-chain verification
            through the hosted facilitator.
          </DocP>
          <DocSubSection title="Supabase setup (required)">
            <DocP>
              Run the schema in your Supabase SQL editor once. This creates the payments table
              and replay-protection cache.
            </DocP>
            <DocCode lang="sql">{`create table if not exists public.payments (
  id             bigserial primary key,
  tx             text not null unique,
  wallet_address text,
  bot_name       text,
  path           text,
  lamports       bigint,
  timestamp      timestamptz not null default now()
);

create table if not exists public.verified_tx_cache (
  tx        text primary key,
  cached_at timestamptz not null default now()
);`}</DocCode>
            <DocCode lang="bash">{`# .env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key`}</DocCode>
          </DocSubSection>
        </DocSection>

        {/* Quick Start */}
        <DocSection id="quickstart" title="Quick Start">
          <DocP>
            The only required config is your Solana wallet address. Everything else has a sensible default.
          </DocP>

          <DocSubSection id="express" title="Express">
            <DocCode lang="js">{`import express from "express";
import { createPaywall } from "tollgate-sdk";
import { expressMiddleware } from "tollgate-sdk/express";

const paywall = createPaywall({
  walletAddress: process.env.SOLANA_WALLET_ADDRESS,
  network: "mainnet-beta",
  protect: ["/*"],              // gate all routes
  basePriceMicroUsdc: 1_000,   // $0.001 per crawl
});

const app = express();
app.use(expressMiddleware(paywall));

// req.paywallPayment is set when a bot paid successfully
app.get("/articles/:slug", (req, res) => {
  res.json({
    content: "Your article...",
    payment: req.paywallPayment ?? null,
  });
});`}</DocCode>
          </DocSubSection>

          <DocSubSection id="nextjs" title="Next.js (App Router)">
            <DocP>
              Use <DocBadge>paywallMiddleware</DocBadge> in <DocBadge>middleware.ts</DocBadge> to gate
              routes at the edge, before any route handler runs.
            </DocP>
            <DocCode lang="ts">{`// middleware.ts
import { createPaywall } from "tollgate-sdk";
import { paywallMiddleware } from "tollgate-sdk/nextjs";

const paywall = createPaywall({
  walletAddress: process.env.SOLANA_WALLET_ADDRESS!,
  basePriceMicroUsdc: 1_000,
  protect: ["/articles/*", "/blog/*"],
});

export default paywallMiddleware(paywall);

export const config = { matcher: ["/articles/:path*", "/blog/:path*"] };`}</DocCode>
            <DocP>For App Router route handlers, use <DocBadge>withRouteHandler</DocBadge>:</DocP>
            <DocCode lang="ts">{`// app/articles/[slug]/route.ts
import { withRouteHandler } from "tollgate-sdk/nextjs";
import { paywall } from "@/lib/paywall"; // shared instance

export const GET = withRouteHandler(paywall, async (req) =>
  Response.json({ content: "Your article..." })
);`}</DocCode>
          </DocSubSection>

          <DocSubSection id="fastify" title="Fastify">
            <DocCode lang="js">{`import Fastify from "fastify";
import { createPaywall } from "tollgate-sdk";
import { fastifyPlugin } from "tollgate-sdk/fastify";

const paywall = createPaywall({
  walletAddress: process.env.SOLANA_WALLET_ADDRESS,
  basePriceMicroUsdc: 1_000,
});

const app = Fastify();
await app.register(fastifyPlugin, { paywall });

app.get("/articles/:slug", async (req, reply) => {
  return { content: "Your article..." };
});`}</DocCode>
          </DocSubSection>

          <DocSubSection id="cloudflare" title="Cloudflare Workers">
            <DocCode lang="js">{`import { createPaywall } from "tollgate-sdk";
import { cloudflareHandler } from "tollgate-sdk/cloudflare";

export default {
  async fetch(request, env) {
    const paywall = createPaywall({
      walletAddress: env.SOLANA_WALLET_ADDRESS,
      basePriceMicroUsdc: 1_000,
    });

    return cloudflareHandler(paywall, request, async () =>
      new Response(JSON.stringify({ content: "Your article..." }), {
        headers: { "Content-Type": "application/json" },
      })
    );
  },
};`}</DocCode>
          </DocSubSection>
        </DocSection>

        {/* Config */}
        <DocSection id="config" title="Configuration">
          <DocP>
            Pass these options to <DocBadge>createPaywall({"{ ... }"})</DocBadge>.
          </DocP>
          <DocTable
            headers={["Option", "Default", "Description"]}
            rows={[
              [<DocBadge key="w">walletAddress</DocBadge>, <span key="r" className="text-danger text-xs">required</span>, "Your Solana wallet address. USDC payments land at its ATA."],
              [<DocBadge key="n">network</DocBadge>, <DocBadge key="nd" color="default">"devnet"</DocBadge>, 'Solana network — "devnet" or "mainnet-beta".'],
              [<DocBadge key="p">protect</DocBadge>, <DocBadge key="pd" color="default">["/*"]</DocBadge>, 'Path globs or RegExp patterns to gate. Use ["/*"] to protect all routes.'],
              [<DocBadge key="b">basePriceMicroUsdc</DocBadge>, <DocBadge key="bd" color="default">1000</DocBadge>, "Price per crawl in micro-USDC. 1000 = $0.001. 1_000_000 = $1.00."],
              [<DocBadge key="t">botScoreThreshold</DocBadge>, <DocBadge key="btd" color="default">70</DocBadge>, "Composite score threshold for bot classification. Lower = stricter."],
              [<DocBadge key="a">allowList</DocBadge>, <DocBadge key="ad" color="default">[]</DocBadge>, "UA patterns that always pass as humans, e.g. [{pattern: /Googlebot/i}]."],
              [<DocBadge key="f">failOpen</DocBadge>, <DocBadge key="fd" color="default">false</DocBadge>, "If true, allow bots through when the facilitator is unreachable."],
              [<DocBadge key="od">onDetection(d)</DocBadge>, "—", "Hook called with the bot detection result on every classified request."],
              [<DocBadge key="api">apiUrl</DocBadge>, "hosted", "Override the facilitator URL for self-hosting."],
              [<DocBadge key="tm">timeoutMs</DocBadge>, <DocBadge key="tmd" color="default">8000</DocBadge>, "Network timeout for facilitator calls in milliseconds."],
            ]}
          />

          <DocSubSection title="Path matching">
            <DocP>
              The <DocBadge>protect</DocBadge> option accepts strings or RegExp. String patterns support <DocBadge>*</DocBadge> suffix wildcards.
            </DocP>
            <DocCode lang="js">{`protect: ["/*"]                  // all routes
protect: ["/articles/*"]        // prefix match
protect: ["/blog/*", "/docs/*"] // multiple prefixes
protect: [/^\/api\//]           // RegExp`}</DocCode>
          </DocSubSection>

          <DocSubSection title="Using req.paywallPayment">
            <DocP>
              After a verified payment, Express and Fastify attach the payment receipt to the request object.
            </DocP>
            <DocCode lang="js">{`app.get("/article", (req, res) => {
  console.log(req.paywallPayment);
  // {
  //   signature: "3jK9xZ...",  // Solana tx signature
  //   payer:     "AgentWallet...",
  //   received:  1000           // micro-USDC received
  // }
});`}</DocCode>
          </DocSubSection>
        </DocSection>

        {/* Bot Detection */}
        <DocSection id="bot-detection" title="Bot Detection">
          <DocP>
            Detection runs entirely in-process — no network call, zero overhead for human visitors.
            A composite score across four signals determines whether a request is classified as a bot.
          </DocP>
          <DocTable
            headers={["Signal", "Examples", "Score"]}
            rows={[
              ["User-Agent match", "GPTBot, ClaudeBot, PerplexityBot, CCBot, Scrapy, python-requests", "55–90 pts"],
              ["Missing browser headers", "accept-language, sec-fetch-site, sec-ch-ua absent", "12 pts each"],
              ["No Accept: text/html", "Scripts rarely request HTML", "15 pts"],
              ["Datacenter IP", "AWS, GCP, Azure, Cloudflare CIDR ranges", "30 pts"],
              ["Reverse DNS verified", "Real Googlebot/ClaudeBot resolve to known hostnames", "Labelled, not blocked"],
            ]}
          />
          <DocP>
            Score ≥ 70 → bot (gated). Score 40–69 → suspicious (passed through by default). Score {"<"} 40 → human.
            Tune the threshold with <DocBadge>botScoreThreshold</DocBadge>.
          </DocP>
          <DocSubSection title="Using the onDetection hook">
            <DocCode lang="js">{`const paywall = createPaywall({
  walletAddress: process.env.SOLANA_WALLET_ADDRESS,
  protect: ["/*"],
  onDetection: (d) => {
    console.log({
      isBot:    d.isBot,
      botName:  d.botName,     // "GPTBot", "ClaudeBot", etc.
      score:    d.score,       // composite score
      signals:  d.signals,     // ["ua:GPTBot(90)", "headers:suspicious(36)", ...]
      ip:       d.ip,
    });
  },
});`}</DocCode>
          </DocSubSection>
        </DocSection>

        {/* Pricing */}
        <DocSection id="pricing" title="Dynamic Pricing">
          <DocP>
            The base price is multiplied by signals from the bot type and content being requested.
            The final price is returned in the 402 envelope so agents can decide whether to pay before committing.
          </DocP>
          <DocCode lang="text">{`final_price = base × bot_multiplier × content_affinity × exclusivity_mod`}</DocCode>
          <DocTable
            headers={["Bot / crawler", "Multiplier", "Rationale"]}
            rows={[
              ["CCBot (Common Crawl)", "2.8×", "Training data — highest commercial value"],
              ["GPTBot, ClaudeBot", "2.5×", "LLM training / inference"],
              ["MetaAI, CohereBot", "2.6–2.7×", "Training data"],
              ["PerplexityBot", "2.0×", "Answer engine"],
              ["Googlebot, Bingbot", "1.0×", "Search index — don't over-price"],
              ["Unknown", "1.5×", "Conservative default"],
            ]}
          />
          <DocP>
            Content type is detected from path patterns (<DocBadge>/blog/</DocBadge> = prose,
            <DocBadge>/data/</DocBadge> = dataset) and body signals (code blocks, tables).
            The 402 response body includes the full score breakdown so agents can inspect it.
          </DocP>
        </DocSection>

        {/* Dashboard */}
        <DocSection id="dashboard" title="Dashboard & Auth">
          <DocP>
            The dashboard shows payments received, top bots, and top paid pages — scoped to your wallet.
            Authentication uses Sign-In With Solana: you sign a server-issued message, no password required.
          </DocP>
          <DocSubSection title="Step 1 — Request a nonce">
            <DocCode lang="bash">{`curl -X POST https://ai-paywall-production-f453.up.railway.app/v1/auth/nonce \\
  -H "Content-Type: application/json" \\
  -d '{"walletAddress": "YourSolanaWallet..."}'

# Response:
# {
#   "token": "<opaque-token>",
#   "message": "ai-paywall.dev wants you to sign in...",
#   "expiresAt": "2026-05-12T12:05:00.000Z"
# }`}</DocCode>
          </DocSubSection>
          <DocSubSection title="Step 2 — Sign the message">
            <DocCode lang="js">{`import nacl from "tweetnacl";
import bs58 from "bs58";

// message = the exact string from Step 1
const messageBytes = new TextEncoder().encode(message);
const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
const signatureBase58 = bs58.encode(signature);`}</DocCode>
          </DocSubSection>
          <DocSubSection title="Step 3 — Exchange for a session (valid 24h)">
            <DocCode lang="bash">{`curl -X POST https://ai-paywall-production-f453.up.railway.app/v1/auth/verify \\
  -H "Content-Type: application/json" \\
  -d '{
    "walletAddress": "YourSolanaWallet...",
    "message": "<exact message from Step 1>",
    "signature": "<base58 signature>",
    "token": "<token from Step 1>"
  }'

# Response: { "session": "<token>", "expiresAt": "..." }`}</DocCode>
          </DocSubSection>
          <DocSubSection title="Step 4 — Fetch analytics">
            <DocCode lang="bash">{`curl https://ai-paywall-production-f453.up.railway.app/v1/dashboard \\
  -H "Authorization: Bearer <session-token>"

# Response:
# {
#   "wallet": { "address": "YourWallet..." },
#   "total": 42,
#   "total_lamports": 56000,
#   "payments": [
#     { "tx": "3jK9...", "botName": "GPTBot", "path": "/article", "lamports": 1000, "timestamp": "..." },
#     ...
#   ]
# }`}</DocCode>
          </DocSubSection>
          <DocSubSection title="Check your treasury ATA">
            <DocCode lang="bash">{`# Verify where payments will land before going live
curl "https://ai-paywall-production-f453.up.railway.app/v1/wallet/treasury?walletAddress=YourWallet&network=mainnet-beta"

# Response:
# {
#   "walletAddress": "YourWallet...",
#   "network": "mainnet-beta",
#   "usdcMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
#   "treasuryAta": "7xKpT..."
# }`}</DocCode>
          </DocSubSection>
        </DocSection>

        {/* Env */}
        <DocSection id="env" title="Environment Variables">
          <DocCode lang="bash">{`# Required
SOLANA_WALLET_ADDRESS=YourSolanaWallet...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Recommended
SOLANA_NETWORK=mainnet-beta
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=...

# Auth secrets — generate fresh: openssl rand -hex 32
PAYWALL_CHALLENGE_SECRET=<32-byte-hex>
PAYWALL_AUTH_SECRET=<32-byte-hex>
PAYWALL_AUTH_DOMAIN=yourdomain.com

# Optional — enables auto-creation of USDC ATAs for new publisher wallets
FACILITATOR_FEE_PAYER_SECRET_KEY=[...keypair-json-array...]`}</DocCode>
          <DocCallout type="warning">
            Never commit <DocBadge>.env</DocBadge> to source control. Rotate{" "}
            <DocBadge>PAYWALL_CHALLENGE_SECRET</DocBadge> and{" "}
            <DocBadge>PAYWALL_AUTH_SECRET</DocBadge> before going to production.
          </DocCallout>
        </DocSection>
      </div>
    </DocLayout>
  );
}
