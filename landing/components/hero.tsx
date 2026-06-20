"use client";

import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, Terminal } from "lucide-react";

const TERMINAL_LINES = [
  { delay: 0,    text: "$ curl -A 'GPTBot/1.0' https://yoursite.com/articles/ai-trends", type: "cmd" },
  { delay: 800,  text: "HTTP/1.1 402 Payment Required", type: "status" },
  { delay: 1000, text: "{", type: "json" },
  { delay: 1100, text: '  "scheme": "exact",', type: "json" },
  { delay: 1200, text: '  "payTo": "7xKpT...ATA",', type: "json" },
  { delay: 1300, text: '  "asset": "USDC on Solana",', type: "json" },
  { delay: 1400, text: '  "amountMicroUsdc": 1000,', type: "json" },
  { delay: 1500, text: '  "challenge": "tok_9fK2mN..."', type: "json" },
  { delay: 1600, text: "}", type: "json" },
  { delay: 2200, text: "", type: "gap" },
  { delay: 2300, text: "# Agent pays 0.001 USDC on-chain...", type: "comment" },
  { delay: 3100, text: "$ curl ... -H 'X-PAYMENT: <signed_tx>'", type: "cmd" },
  { delay: 3400, text: "HTTP/1.1 200 OK", type: "ok" },
  { delay: 3600, text: '{ "content": "...", "paywallPayment": { "signature": "3jK9...", "received": 1000 } }', type: "ok" },
];

function TerminalLine({ text, type, visible }: { text: string; type: string; visible: boolean }) {
  if (!visible || type === "gap") return <div className="h-3" />;

  const color =
    type === "cmd"     ? "text-accent" :
    type === "status"  ? "text-yellow-400" :
    type === "ok"      ? "text-success" :
    type === "comment" ? "text-inkSubtle" :
                         "text-inkMuted";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className={`code-block ${color} truncate`}
    >
      {text}
    </motion.div>
  );
}

export function Hero() {
  const [visibleLines, setVisibleLines] = useState<number[]>([]);
  const loopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    function runSequence() {
      setVisibleLines([]);
      TERMINAL_LINES.forEach((line, i) => {
        loopRef.current = setTimeout(() => {
          if (!cancelled) setVisibleLines((prev) => [...prev, i]);
        }, line.delay);
      });

      // Restart after last line + pause
      const totalDuration = Math.max(...TERMINAL_LINES.map((l) => l.delay)) + 3500;
      loopRef.current = setTimeout(() => {
        if (!cancelled) runSequence();
      }, totalDuration);
    }

    runSequence();
    return () => {
      cancelled = true;
      if (loopRef.current) clearTimeout(loopRef.current);
    };
  }, []);

  return (
    <section className="relative min-h-screen flex flex-col justify-center overflow-hidden">
      {/* Grid background */}
      <div className="absolute inset-0 grid-bg opacity-100 pointer-events-none" />

      {/* Radial glow behind hero */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="w-[600px] h-[600px] rounded-full bg-gradient-radial from-accent/5 via-transparent to-transparent" />
      </div>

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-28 pb-20 w-full">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left: Copy */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <span className="section-label">Introducing Tollgate</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="mt-4 text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-ink leading-[1.1]"
            >
              robots.txt was{" "}
              <span className="text-inkMuted line-through decoration-danger decoration-2">
                a suggestion.
              </span>
              <br />
              <span className="text-accent">This isn&apos;t.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mt-6 text-lg text-inkMuted leading-relaxed max-w-xl"
            >
              Tollgate makes AI agent access{" "}
              <strong className="text-ink font-medium">enforceable at the protocol layer</strong>.
              Publishers gate content with a two-line SDK and receive USDC micropayments
              directly in their wallet. Agents pay automatically, or don&apos;t get in.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="mt-8 flex flex-wrap gap-3"
            >
              <Link
                href="/docs/publisher"
                className="inline-flex items-center gap-2 bg-accent hover:bg-accent-light text-black font-semibold px-5 py-2.5 rounded-md transition-colors text-sm"
              >
                Get Started
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 border border-border hover:border-borderStrong text-inkMuted hover:text-ink px-5 py-2.5 rounded-md transition-colors text-sm"
              >
                Contact Sales
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.5 }}
              className="mt-8 flex items-center gap-6 text-xs text-inkSubtle"
            >
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-success" />
                Solana mainnet &amp; devnet
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-success" />
                No API key required
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-success" />
                MIT license
              </span>
            </motion.div>
          </div>

          {/* Right: Terminal */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="relative"
          >
            <div className="rounded-xl border border-border bg-raised overflow-hidden shadow-2xl glow-accent-sm">
              {/* Terminal title bar */}
              <div className="flex items-center gap-2 px-4 py-3 bg-surface border-b border-border">
                <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
                <div className="w-3 h-3 rounded-full bg-[#28c840]" />
                <div className="ml-3 flex items-center gap-1.5 text-xs text-inkSubtle">
                  <Terminal className="w-3 h-3" />
                  tollgate — agent access flow
                </div>
              </div>

              {/* Terminal body */}
              <div className="p-4 space-y-0.5 min-h-[280px]">
                {TERMINAL_LINES.map((line, i) => (
                  <TerminalLine
                    key={i}
                    text={line.text}
                    type={line.type}
                    visible={visibleLines.includes(i)}
                  />
                ))}
                {visibleLines.length < TERMINAL_LINES.length && (
                  <div className="code-block text-accent">
                    <span className="animate-cursor-blink">█</span>
                  </div>
                )}
              </div>
            </div>

            {/* Floating badge */}
            <div className="absolute -bottom-4 -right-4 bg-surface border border-border rounded-lg px-3 py-2 shadow-lg">
              <div className="text-xs text-inkSubtle">settled on-chain</div>
              <div className="text-sm font-semibold text-success">+$0.001 USDC</div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
