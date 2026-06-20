"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import Link from "next/link";
import { Server, Bot, ArrowRight, Check } from "lucide-react";

const PUBLISHER_CODE = `import { createPaywall } from "tollgate-sdk";
import { expressMiddleware } from "tollgate-sdk/express";

const paywall = createPaywall({
  walletAddress: process.env.SOLANA_WALLET_ADDRESS,
  network: "mainnet-beta",
  protect: ["/articles/*", "/blog/*"],
  basePriceMicroUsdc: 1_000, // $0.001 per crawl
});

app.use(expressMiddleware(paywall));

// req.paywallPayment is available on paid routes
app.get("/articles/:slug", (req, res) => {
  res.json({ paid: true, sig: req.paywallPayment?.signature });
});`;

const AGENT_CODE = `import {
  createAgentPaywallClient,
  fromKeypairFile,
} from "tollgate-agent-sdk";

const client = createAgentPaywallClient({
  network: "mainnet-beta",
  signer: fromKeypairFile(),       // ~/.config/solana/id.json
  maxAmountMicroUsdc: 10_000,      // hard cap: $0.01 per request
  maxTotalMicroUsdc: 1_000_000,    // session budget: $1.00
});

// Drop-in fetch — auto-pays 402s, retries transparently
const res = await client.fetch("https://site.com/articles/ai");
const data = await res.json();

console.log("paid:", res.paywallPayment?.signature);
console.log("spend:", client.spend());`;

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="code-block text-inkMuted overflow-x-auto p-4 rounded-lg bg-base border border-border text-xs leading-relaxed">
      <code>{code}</code>
    </pre>
  );
}

export function SDKs() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <section id="sdks" className="py-24 border-t border-border">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <span className="section-label">Two SDKs</span>
          <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-ink tracking-tight">
            One protocol. Both sides of the market.
          </h2>
          <p className="mt-4 text-inkMuted max-w-2xl mx-auto">
            Publishers gate their content. Agents pay for access. Each SDK is self-contained
            and works independently — install only what your side needs.
          </p>
        </motion.div>

        <div className="mt-16 grid lg:grid-cols-2 gap-6">
          {/* Publisher SDK */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.5 }}
            className="rounded-xl border border-border bg-surface overflow-hidden flex flex-col"
          >
            <div className="p-6 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <Server className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <div className="text-xs text-inkSubtle font-mono">tollgate-sdk</div>
                  <div className="text-base font-semibold text-ink">Publisher SDK</div>
                </div>
              </div>
              <p className="mt-3 text-sm text-inkMuted">
                Drop-in middleware for Express, Next.js, Fastify, and Cloudflare Workers.
                Provide your Solana wallet — payments land there directly.
              </p>
            </div>

            <div className="p-6 space-y-3 flex-1">
              {[
                "Local bot detection — no network call for human visitors",
                "HTTP 402 x402 envelopes with signed per-request challenges",
                "On-chain USDC verification, replay-protected via Supabase",
                "Adapters: Express, Next.js App Router, Fastify, Cloudflare Workers",
                "Optional analytics dashboard via Sign-In With Solana",
                "No API key, no signup, no custodian — wallet-only",
              ].map((f) => (
                <div key={f} className="flex gap-2.5 text-sm">
                  <Check className="w-4 h-4 text-success shrink-0 mt-0.5" />
                  <span className="text-inkMuted">{f}</span>
                </div>
              ))}
            </div>

            <div className="px-6 pb-6">
              <CodeBlock code={PUBLISHER_CODE} />
              <Link
                href="/docs/publisher"
                className="mt-4 inline-flex items-center gap-2 text-sm text-accent hover:text-accent-light transition-colors font-medium"
              >
                Publisher SDK docs <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </motion.div>

          {/* Agent SDK */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.5 }}
            className="rounded-xl border border-border bg-surface overflow-hidden flex flex-col"
          >
            <div className="p-6 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-success" />
                </div>
                <div>
                  <div className="text-xs text-inkSubtle font-mono">tollgate-agent-sdk</div>
                  <div className="text-base font-semibold text-ink">Agent SDK</div>
                </div>
              </div>
              <p className="mt-3 text-sm text-inkMuted">
                Gives any AI agent the ability to pay HTTP 402 paywalls automatically,
                safely, and within configurable budget limits.
              </p>
            </div>

            <div className="p-6 space-y-3 flex-1">
              {[
                "Drop-in client.fetch() — 402s handled automatically and transparently",
                "Hard caps: maxAmountMicroUsdc and maxTotalMicroUsdc per session",
                "Signer helpers: keypair file, raw array, base58 secret, custom HSM/KMS",
                "LangChain tool via paywallFetchTool(client) — OpenAI-compatible",
                "Coalesces concurrent requests — never pays twice for the same nonce",
                "Typed errors: PaymentRefusedError, BudgetExceededError, OnChainError",
              ].map((f) => (
                <div key={f} className="flex gap-2.5 text-sm">
                  <Check className="w-4 h-4 text-success shrink-0 mt-0.5" />
                  <span className="text-inkMuted">{f}</span>
                </div>
              ))}
            </div>

            <div className="px-6 pb-6">
              <CodeBlock code={AGENT_CODE} />
              <Link
                href="/docs/agent"
                className="mt-4 inline-flex items-center gap-2 text-sm text-success hover:text-green-400 transition-colors font-medium"
              >
                Agent SDK docs <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
