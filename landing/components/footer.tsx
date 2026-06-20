import Link from "next/link";
import { Shield, Github, Twitter } from "lucide-react";

const NAV = [
  {
    heading: "Product",
    links: [
      { label: "How It Works", href: "/#how-it-works" },
      { label: "SDKs", href: "/#sdks" },
      { label: "Features", href: "/#features" },
      { label: "Pricing", href: "/#pricing" },
    ],
  },
  {
    heading: "Developers",
    links: [
      { label: "Docs", href: "/docs/publisher" },
      { label: "Publisher SDK", href: "/docs/publisher" },
      { label: "Agent SDK", href: "/docs/agent" },
      { label: "FAQ", href: "/#faq" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "Contact Sales", href: "/contact" },
      { label: "GitHub", href: "https://github.com" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-accent flex items-center justify-center">
                <Shield className="w-4 h-4 text-black" strokeWidth={2.5} />
              </div>
              <span className="font-semibold text-ink">Tollgate</span>
            </Link>
            <p className="mt-3 text-sm text-inkSubtle max-w-xs leading-relaxed">
              The HTTP 402 consent layer that AI agents can&apos;t ignore. USDC
              micropayments on Solana, direct to your wallet.
            </p>
            <div className="mt-4 flex gap-3">
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-inkSubtle hover:text-inkMuted transition-colors"
                aria-label="GitHub"
              >
                <Github className="w-4 h-4" />
              </a>
              <a
                href="https://twitter.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-inkSubtle hover:text-inkMuted transition-colors"
                aria-label="Twitter / X"
              >
                <Twitter className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Nav columns */}
          {NAV.map((col) => (
            <div key={col.heading}>
              <div className="text-xs font-semibold text-inkSubtle uppercase tracking-wider mb-4">
                {col.heading}
              </div>
              <ul className="space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-sm text-inkMuted hover:text-ink transition-colors"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-inkSubtle">
            © 2026 Tollgate. MIT license — both SDKs are free and open source.
          </p>
          <div className="flex items-center gap-1.5 text-xs text-inkSubtle">
            <span className="w-1.5 h-1.5 rounded-full bg-success" />
            Solana devnet + mainnet-beta
          </div>
        </div>
      </div>
    </footer>
  );
}
