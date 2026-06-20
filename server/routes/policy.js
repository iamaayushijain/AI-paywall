import { Router } from 'express';
import {
  getTreasuryUsdcAta,
  getUsdcMintAddress,
  getNetwork,
} from '../services/verifyPayment.js';

const router = Router();

router.get('/', (_req, res) => {
  const internalNet = getNetwork();
  const x402Net = internalNet === 'mainnet-beta' ? 'solana-mainnet' : `solana-${internalNet}`;

  res.json({
    version: '1.0',
    protocol: 'x402',

    payment: {
      scheme:   'exact',
      network:  x402Net,
      asset:    getUsdcMintAddress(),
      payTo:    getTreasuryUsdcAta(),
      wallet:   process.env.WALLET_ADDRESS,
      currency: 'USDC',
    },

    pricing: {
      base_micro_usdc:      1_000,
      relevance_multiplier: true,
      description:
        'Final price = base_micro_usdc × relevance_score (1–10). '
        + 'Score depends on bot type and page content density. '
        + '1,000,000 micro-USDC = $1.',
    },

    path_multipliers: {
      '/':           0.5,
      '/blog/*':     2.0,
      '/articles/*': 2.0,
      '/docs/*':     1.5,
      '/api/*':      1.5,
      '/data/*':     3.0,
      '/research/*': 3.0,
      '*':           1.0,
    },

    bot_tiers: {
      GPTBot:        8,
      ClaudeBot:     8,
      PerplexityBot: 7,
      CCBot:         10,
      GoogleBot:     4,
      unknown:       5,
    },

    free_agents: ['Googlebot'],

    payment_header:          'x-payment',
    payment_response_header: 'x-payment-response',

    arweave_license: null,
  });
});

export default router;
