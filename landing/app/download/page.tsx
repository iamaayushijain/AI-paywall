"use client";

import { useState } from "react";
import Link from "next/link";
import { Nav } from "@/components/nav";
import { Footer } from "@/components/footer";
import { Shield, Server, Bot, Copy, Check, ArrowLeft } from "lucide-react";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="flex items-center gap-1.5 text-xs text-inkSubtle hover:text-inkMuted transition-colors"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function InstallBlock({ cmd }: { cmd: string }) {
  return (
    <div className="flex items-center justify-between gap-4 bg-base border border-border rounded-lg px-4 py-3">
      <code className="code-block text-inkMuted text-sm flex-1">{cmd}</code>
      <CopyButton text={cmd} />
    </div>
  );
}

export default function DownloadPage() {
  return (
    <main>
      <Nav />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-28 pb-20">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-inkSubtle hover:text-inkMuted transition-colors mb-8"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to home
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
            <Shield className="w-5 h-5 text-accent" />
          </div>
          <span className="section-label">Download</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-ink tracking-tight">
          Install Tollgate SDKs
        </h1>
        <p className="mt-3 text-inkMuted max-w-xl">
          Both SDKs are MIT-licensed and published to npm. Install only what your
          side of the market needs.
        </p>

        {/* Publisher SDK */}
        <section id="publisher" className="mt-16">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
              <Server className="w-4 h-4 text-accent" />
            </div>
            <div>
              <div className="text-xs text-inkSubtle font-mono">tollgate-sdk</div>
              <h2 className="text-xl font-semibold text-ink">Publisher SDK</h2>
            </div>
          </div>

          <p className="text-sm text-inkMuted mb-5">
            Drop-in middleware for Express, Next.js, Fastify, and Cloudflare Workers.
            Requires only your Solana wallet address — no API key, no signup.
          </p>

          <div className="space-y-3">
            <div>
              <div className="text-xs text-inkSubtle mb-2 font-medium">Install</div>
              <InstallBlock cmd="npm install tollgate-sdk" />
            </div>

            <div>
              <div className="text-xs text-inkSubtle mb-2 font-medium">Express</div>
              <InstallBlock cmd='import { createPaywall } from "tollgate-sdk"; import { expressMiddleware } from "tollgate-sdk/express";' />
            </div>
            <div>
              <div className="text-xs text-inkSubtle mb-2 font-medium">Next.js</div>
              <InstallBlock cmd='import { paywallMiddleware } from "tollgate-sdk/nextjs";' />
            </div>
            <div>
              <div className="text-xs text-inkSubtle mb-2 font-medium">Fastify</div>
              <InstallBlock cmd='import { fastifyPlugin } from "tollgate-sdk/fastify";' />
            </div>
            <div>
              <div className="text-xs text-inkSubtle mb-2 font-medium">Cloudflare Workers</div>
              <InstallBlock cmd='import { cloudflareHandler } from "tollgate-sdk/cloudflare";' />
            </div>
          </div>

          <div className="mt-6 p-4 rounded-xl border border-border bg-surface">
            <div className="text-xs text-inkSubtle mb-2 font-medium">Minimum config</div>
            <pre className="code-block text-inkMuted text-xs">{`const paywall = createPaywall({
  walletAddress: process.env.SOLANA_WALLET_ADDRESS,
  network: "mainnet-beta",
  basePriceMicroUsdc: 1_000, // $0.001 per crawl
});

app.use(expressMiddleware(paywall));`}</pre>
          </div>
        </section>

        {/* Divider */}
        <div className="my-12 border-t border-border" />

        {/* Agent SDK */}
        <section id="agent">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-success/10 flex items-center justify-center">
              <Bot className="w-4 h-4 text-success" />
            </div>
            <div>
              <div className="text-xs text-inkSubtle font-mono">tollgate-agent-sdk</div>
              <h2 className="text-xl font-semibold text-ink">Agent SDK</h2>
            </div>
          </div>

          <p className="text-sm text-inkMuted mb-5">
            Drop-in 402-paywall client for AI agents. Handles detection, payment,
            and retry automatically. Peer dependencies required.
          </p>

          <div className="space-y-3">
            <div>
              <div className="text-xs text-inkSubtle mb-2 font-medium">Install (with peer deps)</div>
              <InstallBlock cmd="npm install tollgate-agent-sdk @solana/web3.js @solana/spl-token @x402-solana/core" />
            </div>
            <div>
              <div className="text-xs text-inkSubtle mb-2 font-medium">LangChain tool</div>
              <InstallBlock cmd='import { paywallFetchTool } from "tollgate-agent-sdk/langchain";' />
            </div>
          </div>

          <div className="mt-6 p-4 rounded-xl border border-border bg-surface">
            <div className="text-xs text-inkSubtle mb-2 font-medium">Minimum config</div>
            <pre className="code-block text-inkMuted text-xs">{`import { createAgentPaywallClient, fromKeypairFile } from "tollgate-agent-sdk";

const client = createAgentPaywallClient({
  network: "mainnet-beta",
  signer: fromKeypairFile(),      // ~/.config/solana/id.json
  maxAmountMicroUsdc: 10_000,     // never pay > $0.01/request
  maxTotalMicroUsdc: 1_000_000,   // session budget: $1.00
});

const res = await client.fetch("https://site.com/article");
console.log("paid:", res.paywallPayment?.signature);`}</pre>
          </div>
        </section>
      </div>

      <Footer />
    </main>
  );
}
