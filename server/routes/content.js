import { Router } from 'express';
import {
  verifyPayment,
  getTreasuryUsdcAta,
  getUsdcMintAddress,
  getNetwork,
} from '../services/verifyPayment.js';
import { recordPayment } from '../data/payments.js';
import {
  getPriceForRequest,
  scorePageValue,           // ← replaces scoreRelevance + getContentSignals
} from '../services/relevanceScorer.js';
import { createPaymentChallenge } from '../services/paymentChallenge.js';

const router = Router();
const BASE_PRICE_MICRO_USDC = 1_000;

function x402Network() {
  const n = getNetwork();
  if (n === 'mainnet-beta') return 'solana-mainnet';
  return `solana-${n}`;
}

function getPageContent(path) {
  return {
    title: `Content at ${path}`,
    body: 'This is exclusive content unlocked after x402 payment verification. '
      + 'It contains valuable data, analysis, and insights that AI agents can use.',
    path,
    timestamp: new Date().toISOString(),
    // ↓ Add these fields from your CMS/DB when available — they feed the pricing engine.
    publishedAt:  null,    // e.g. "2024-11-01T00:00:00Z"
    exclusivity:  'public', // 'public' | 'metered' | 'subscriber' | 'proprietary'
    monthlyViews: null,    // e.g. 42_000
  };
}

// ─── Shared param builder ─────────────────────────────────────────────────────
// Keeps both call sites (402 and verified) consistent. Pass an empty body
// for the 402 challenge — the actual body is only available after we decide
// to serve the content, so the pre-payment score is intentionally conservative.

function buildScoringParams(req, body = '', content = {}) {
  return {
    botName:      req.botName,
    path:         req.path,
    body,
    publishedAt:  content.publishedAt  ?? null,
    exclusivity:  content.exclusivity  ?? 'public',
    monthlyViews: content.monthlyViews ?? null,
  };
}

router.get('*', async (req, res, next) => {
  try {
    await handle(req, res);
  } catch (err) {
    next(err);
  }
});

async function handle(req, res) {
  if (!req.isAI) {
    return res.json({
      status: 'ok',
      message: 'Welcome, human! Content is free for you.',
      content: getPageContent(req.path),
    });
  }

  const xPayment = req.headers['x-payment'];

  // ── 402: No payment header yet ───────────────────────────────────────────
  if (!xPayment) {
    // Score without body — conservative estimate shown to the bot upfront.
    const scoringParams = buildScoringParams(req);
    const { price, score, breakdown } = getPriceForRequest(
      scoringParams,
      BASE_PRICE_MICRO_USDC,
    );
    const challenge = createPaymentChallenge(req.path);

    return res.status(402).json({
      x402Version: 1,
      error: 'Payment required to access this content',
      accepts: [
        {
          scheme:             'exact',
          network:            x402Network(),
          maxAmountRequired:  String(price),
          resource:           req.path,
          description:        `AI crawler access to ${req.path}`,
          mimeType:           'application/json',
          outputSchema:       null,
          payTo:              getTreasuryUsdcAta(),
          maxTimeoutSeconds:  300,
          asset:              getUsdcMintAddress(),
        },
      ],
      crawlpay: {
        // ↓ Richer signals from new scorer — bots can use these to decide
        //   whether the page is worth paying for before committing.
        relevance_score:         score,
        content_type:            breakdown.contentType,
        score_breakdown:         {
          affinity:              breakdown.affinity,
          richness:              breakdown.richness,
          freshness:             breakdown.freshness,
        },
        modifiers: {
          bot_multiplier:        breakdown.botMultiplier,
          exclusivity_modifier:  breakdown.exclusivityMod,
          demand_modifier:       breakdown.demandMod,
        },
        base_price_micro_usdc:   BASE_PRICE_MICRO_USDC,
        // Note: price shown here is estimated without body content.
        // Authoritative price is re-computed on verification and may differ slightly.
        estimated_price:         price,
        challenge: {
          token:       challenge.token,
          nonce:       challenge.nonce,
          resource:    challenge.resource,
          expires_at:  challenge.expiresAt,
          header_name: 'x-paywall-challenge',
        },
      },
    });
  }

  // ── Payment header present — re-score with actual content ────────────────
  const content = getPageContent(req.path);
  const scoringParams = buildScoringParams(req, content.body, content);

  const { price: actualPrice, score, breakdown } = getPriceForRequest(
    scoringParams,
    BASE_PRICE_MICRO_USDC,
  );

  const challengeToken = req.headers['x-paywall-challenge'];
  const result = await verifyPayment(xPayment, req.path, actualPrice, challengeToken);

  if (result.verified && result.signature) {
    // Recording is best-effort: don't block content unlock on analytics storage.
    try {
      await recordPayment({
        tx:              result.signature,
        botName:         req.botName,
        userAgent:       req.headers['user-agent'],
        path:            req.path,
        pageHash:        req.path,
        lamports:        result.received || actualPrice,
        relevanceScore:  score,
        // ↓ Store richer breakdown for analytics/pricing tuning
        contentType:     breakdown.contentType,
        botMultiplier:   breakdown.botMultiplier,
        exclusivityMod:  breakdown.exclusivityMod,
      });
    } catch (err) {
      console.warn('Failed to record payment:', err.message);
    }

    return res.json({
      status:   'ok',
      message:  'Payment verified. Content unlocked.',
      content,
    });
  }

  return res.status(403).json({
    status:  'forbidden',
    message: 'Payment verification failed.',
    error:   result.error,
  });
}

export default router;