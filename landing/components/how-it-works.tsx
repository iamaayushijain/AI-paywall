"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Bot, CreditCard, CheckCircle, ArrowRight } from "lucide-react";

const STEPS = [
  {
    step: "01",
    icon: Bot,
    title: "Agent hits your content",
    body: "An AI crawler requests your page. Tollgate's SDK detects it via user-agent, header fingerprinting, and datacenter IP scoring — before serving a single byte.",
    detail: "Detects: GPTBot, ClaudeBot, PerplexityBot, Scrapy, python-requests, and 20+ others",
  },
  {
    step: "02",
    icon: CreditCard,
    title: "HTTP 402: pay to continue",
    body: "The server returns HTTP 402 with an x402 challenge envelope — price in micro-USDC, your wallet's ATA as recipient, and a signed nonce bound to the request.",
    detail: "The agent's SDK reads the envelope, builds a USDC SPL transfer, signs it, and submits to Solana.",
  },
  {
    step: "03",
    icon: CheckCircle,
    title: "On-chain verification, content unlocked",
    body: "The server verifies the transaction against Solana RPC — confirms amount, recipient ATA, and challenge binding. No double-spend. Content released.",
    detail: "Payment lands directly in your wallet. No intermediary, no custodian, no API key.",
  },
];

export function HowItWorks() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <section id="how-it-works" className="py-24 border-t border-border bg-surface">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <span className="section-label">How It Works</span>
          <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-ink tracking-tight">
            Three steps. Zero trust required.
          </h2>
          <p className="mt-4 text-inkMuted max-w-2xl mx-auto">
            The entire flow — detection, challenge, payment, verification — runs at the HTTP
            layer. No webhooks, no callbacks, no async settlement lag.
          </p>
        </motion.div>

        {/* Steps */}
        <div className="mt-16 grid md:grid-cols-3 gap-6 relative">
          {/* Connector line (desktop) */}
          <div className="hidden md:block absolute top-[52px] left-[calc(16.666%+1.5rem)] right-[calc(16.666%+1.5rem)] h-px bg-border" />

          {STEPS.map(({ step, icon: Icon, title, body, detail }, i) => {
            const itemRef = useRef(null);
            const itemInView = useInView(itemRef, { once: true, margin: "-40px" });
            return (
              <motion.div
                key={step}
                ref={itemRef}
                initial={{ opacity: 0, y: 20 }}
                animate={itemInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.4, delay: i * 0.15 }}
                className="flex flex-col"
              >
                {/* Icon circle */}
                <div className="relative flex justify-center md:justify-start">
                  <div className="w-[104px] h-[104px] rounded-2xl border border-border bg-raised flex flex-col items-center justify-center gap-1 mx-auto md:mx-0">
                    <Icon className="w-6 h-6 text-accent" />
                    <span className="text-xs text-inkSubtle font-mono">{step}</span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <ArrowRight className="hidden md:block absolute top-1/2 -right-4 -translate-y-1/2 w-4 h-4 text-inkSubtle" />
                  )}
                </div>

                <div className="mt-6">
                  <h3 className="text-base font-semibold text-ink">{title}</h3>
                  <p className="mt-2 text-sm text-inkMuted leading-relaxed">{body}</p>
                  <p className="mt-3 text-xs text-inkSubtle font-mono bg-raised rounded-lg px-3 py-2 border border-border">
                    {detail}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Flow diagram */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.5 }}
          className="mt-16 rounded-xl border border-border bg-raised p-6 overflow-x-auto"
        >
          <div className="min-w-[600px]">
            <FlowDiagram />
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function FlowDiagram() {
  return (
    <svg viewBox="0 0 800 120" className="w-full" aria-label="Payment flow diagram">
      <defs>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="#525252" />
        </marker>
        <marker id="arrow-accent" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="#f59e0b" />
        </marker>
        <marker id="arrow-green" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="#22c55e" />
        </marker>
      </defs>

      {/* Agent */}
      <rect x="10" y="30" width="120" height="60" rx="8" fill="#1a1a1a" stroke="#2a2a2a" strokeWidth="1" />
      <text x="70" y="55" textAnchor="middle" fill="#a3a3a3" fontSize="11" fontFamily="monospace">AI Agent</text>
      <text x="70" y="72" textAnchor="middle" fill="#525252" fontSize="10" fontFamily="monospace">tollgate-agent-sdk</text>

      {/* Arrow: Agent → Publisher */}
      <line x1="132" y1="60" x2="228" y2="60" stroke="#525252" strokeWidth="1" markerEnd="url(#arrow)" />
      <text x="180" y="52" textAnchor="middle" fill="#525252" fontSize="9" fontFamily="monospace">GET /article</text>

      {/* Publisher */}
      <rect x="230" y="30" width="120" height="60" rx="8" fill="#1a1a1a" stroke="#2a2a2a" strokeWidth="1" />
      <text x="290" y="55" textAnchor="middle" fill="#a3a3a3" fontSize="11" fontFamily="monospace">Publisher</text>
      <text x="290" y="72" textAnchor="middle" fill="#525252" fontSize="10" fontFamily="monospace">tollgate-sdk</text>

      {/* Arrow: Publisher → Agent (402) */}
      <line x1="230" y1="75" x2="134" y2="88" stroke="#fbbf24" strokeWidth="1" markerEnd="url(#arrow-accent)" />
      <text x="182" y="100" textAnchor="middle" fill="#f59e0b" fontSize="9" fontFamily="monospace">402 + x402 envelope</text>

      {/* Arrow: Agent → Solana */}
      <line x1="132" y1="52" x2="448" y2="30" stroke="#f59e0b" strokeWidth="1" strokeDasharray="4,3" markerEnd="url(#arrow-accent)" />
      <text x="320" y="30" textAnchor="middle" fill="#f59e0b" fontSize="9" fontFamily="monospace">USDC transfer (signed)</text>

      {/* Solana */}
      <rect x="450" y="8" width="120" height="52" rx="8" fill="#1a1a1a" stroke="#404040" strokeWidth="1" />
      <text x="510" y="30" textAnchor="middle" fill="#a3a3a3" fontSize="11" fontFamily="monospace">Solana</text>
      <text x="510" y="47" textAnchor="middle" fill="#525252" fontSize="10" fontFamily="monospace">USDC on-chain</text>

      {/* Arrow: Agent → Publisher (retry with X-PAYMENT) */}
      <line x1="132" y1="60" x2="228" y2="60" stroke="#525252" strokeWidth="1" />
      <line x1="132" y1="45" x2="228" y2="45" stroke="#22c55e" strokeWidth="1" markerEnd="url(#arrow-green)" />
      <text x="180" y="36" textAnchor="middle" fill="#22c55e" fontSize="9" fontFamily="monospace">X-PAYMENT header</text>

      {/* Arrow: Publisher → Solana (verify) */}
      <line x1="352" y1="50" x2="448" y2="40" stroke="#525252" strokeWidth="1" strokeDasharray="4,3" markerEnd="url(#arrow)" />
      <text x="405" y="56" textAnchor="middle" fill="#525252" fontSize="9" fontFamily="monospace">verify tx</text>

      {/* Arrow: Publisher → Agent (200) */}
      <line x1="230" y1="63" x2="134" y2="63" stroke="#22c55e" strokeWidth="1" markerEnd="url(#arrow-green)" />
      <text x="182" y="78" textAnchor="middle" fill="#22c55e" fontSize="9" fontFamily="monospace">200 + content</text>

      {/* Arrow: Solana → Publisher wallet */}
      <rect x="620" y="30" width="160" height="60" rx="8" fill="#1a1a1a" stroke="#404040" strokeWidth="1" />
      <text x="700" y="55" textAnchor="middle" fill="#22c55e" fontSize="11" fontFamily="monospace">Publisher Wallet</text>
      <text x="700" y="72" textAnchor="middle" fill="#525252" fontSize="10" fontFamily="monospace">+$0.001 USDC</text>
      <line x1="572" y1="45" x2="618" y2="50" stroke="#22c55e" strokeWidth="1" markerEnd="url(#arrow-green)" />
    </svg>
  );
}
