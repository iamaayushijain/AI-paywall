"use client";

import { useState, useRef } from "react";
import { motion, useInView, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

const FAQS = [
  {
    q: "Can't AI agents just ignore this like they ignore robots.txt?",
    a: "That's exactly the point — and the answer is no. robots.txt is a text file with no enforcement. Tollgate enforces at the HTTP protocol layer: the server returns HTTP 402 and serves zero bytes of content until a valid, on-chain USDC payment is verified. There's nothing to \"ignore\" — the content physically doesn't arrive without payment. An agent that skips the payment gets a 402 response body, not your article.",
  },
  {
    q: "Does this affect human visitors?",
    a: "No. Bot detection runs locally in-process using user-agent patterns, header fingerprinting, and IP ranges. Human browsers pass immediately with zero overhead — no network call, no redirect, no latency added. Only requests that score above the bot threshold (≥70) are challenged.",
  },
  {
    q: "Where does the money go? Does Tollgate take a cut?",
    a: "Payments flow directly from the agent's Solana wallet to your wallet ATA on-chain. Tollgate's server never holds funds, has no custody of keys, and takes no percentage of payments. The only fees are Solana network fees (~$0.00025 per transaction). The plan fee covers hosted infrastructure and support, not a slice of your revenue.",
  },
  {
    q: "What if the facilitator is down?",
    a: "You control this. The failOpen option (default false) determines behavior: if false, bots are blocked when the facilitator is unreachable (conservative). If true, they're let through (permissive). For self-hosted setups using the server SDK directly, there's no external facilitator dependency at all.",
  },
  {
    q: "Can I use this with frameworks other than Express?",
    a: "Yes. The publisher SDK ships adapters for Express, Next.js App Router (both middleware and route handler), Fastify (plugin), and Cloudflare Workers. The core is framework-agnostic — if you need a custom adapter, implement the normalized request interface and call runPaywall() directly.",
  },
  {
    q: "What do agents need to integrate on their side?",
    a: "Install tollgate-agent-sdk, provide a Solana keypair (or custom signer), and replace fetch() with client.fetch(). The SDK handles the entire payment flow — parsing the 402, building and submitting the USDC transfer, retrying the request with the X-PAYMENT header. For LangChain, use paywallFetchTool(client) to expose it as a tool. That's the full integration.",
  },
];

function FAQItem({ q, a, index }: { q: string; a: string; index: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 12 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.35, delay: index * 0.05 }}
      className="border border-border rounded-xl overflow-hidden"
    >
      <button
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left bg-surface hover:bg-raised transition-colors"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="text-sm font-medium text-ink">{q}</span>
        <ChevronDown
          className={`w-4 h-4 text-inkSubtle shrink-0 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="px-5 py-4 bg-raised border-t border-border">
              <p className="text-sm text-inkMuted leading-relaxed">{a}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function FAQ() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <section id="faq" className="py-24 border-t border-border bg-surface">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <span className="section-label">FAQ</span>
          <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-ink tracking-tight">
            Common questions
          </h2>
        </motion.div>

        <div className="mt-12 space-y-3">
          {FAQS.map((faq, i) => (
            <FAQItem key={faq.q} q={faq.q} a={faq.a} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
