/**
 * AI Paywall facilitator API.
 *
 * All SDK-facing endpoints are unauthenticated and stateless w.r.t. user
 * identity — the SDK simply declares the wallet that should receive
 * payments. The server issues HMAC-bound challenges, verifies on-chain
 * USDC delivery to the declared wallet, and (best-effort) records
 * analytics rows keyed by wallet_address.
 *
 * Dashboard endpoints are gated by a "Sign-In With Solana" session: the
 * caller proves ownership of the wallet by signing a server-issued nonce.
 */

import { Router } from "express";
import bs58 from "bs58";
import {
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { createAssociatedTokenAccountInstruction } from "@solana/spl-token";

import { createPaymentChallenge } from "../services/paymentChallenge.js";
import {
  verifyPaymentForWallet,
  buildWalletContext,
  resolveUsdcMint,
} from "../services/verifyPaymentForWallet.js";
import {
  recordWalletPayment,
  getWalletPayments,
  getWalletTotalLamports,
} from "../data/wallets.js";
import {
  issueLoginChallenge,
  verifyLoginAndIssueSession,
  requireWalletSession,
} from "../services/walletAuth.js";

const router = Router();
const ATA_EXISTS_CACHE_TTL_MS = 10 * 60 * 1000;
const ataExistsCache = new Map();
const ataEnsureInFlight = new Map();

function parseFeePayerKeypair() {
  const raw = process.env.FACILITATOR_FEE_PAYER_SECRET_KEY;
  if (!raw) return null;

  // Support either base58-encoded 64-byte secret key or JSON array format.
  try {
    if (raw.trim().startsWith("[")) {
      const arr = JSON.parse(raw);
      return Keypair.fromSecretKey(Uint8Array.from(arr));
    }
    const decoded = bs58.decode(raw.trim());
    return Keypair.fromSecretKey(decoded);
  } catch {
    throw new Error(
      "Invalid FACILITATOR_FEE_PAYER_SECRET_KEY. Expected base58 secret key or JSON array.",
    );
  }
}

const feePayerKeypair = parseFeePayerKeypair();

function isLikelySolanaAddress(value) {
  if (typeof value !== "string") return false;
  if (value.length < 32 || value.length > 44) return false;
  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(value);
}

function x402Network(network) {
  return network === "mainnet-beta" ? "solana-mainnet" : `solana-${network}`;
}

function ataCacheKey({ network, mint, ata }) {
  return `${network}:${mint}:${ata}`;
}

async function ensureTreasuryAta({ ctx, walletAddress }) {
  const ata = ctx.treasuryAta.toString();
  const mint = ctx.usdcMint.toString();
  const key = ataCacheKey({ network: ctx.network, mint, ata });
  const now = Date.now();
  const cachedUntil = ataExistsCache.get(key);
  if (cachedUntil && cachedUntil > now) {
    return { created: false, cached: true, ata };
  }

  const existingPromise = ataEnsureInFlight.get(key);
  if (existingPromise) return existingPromise;

  const promise = (async () => {
    const info = await ctx.connection.getAccountInfo(ctx.treasuryAta, "confirmed");
    if (info) {
      ataExistsCache.set(key, Date.now() + ATA_EXISTS_CACHE_TTL_MS);
      return { created: false, cached: false, ata };
    }

    if (!feePayerKeypair) {
      throw new Error(
        "Recipient USDC ATA does not exist and FACILITATOR_FEE_PAYER_SECRET_KEY is not configured for auto-creation.",
      );
    }

    const ownerPk = new PublicKey(walletAddress);
    const ix = createAssociatedTokenAccountInstruction(
      feePayerKeypair.publicKey,
      ctx.treasuryAta,
      ownerPk,
      ctx.usdcMint,
    );
    const tx = new Transaction().add(ix);
    await sendAndConfirmTransaction(ctx.connection, tx, [feePayerKeypair], {
      commitment: "confirmed",
    });

    ataExistsCache.set(key, Date.now() + ATA_EXISTS_CACHE_TTL_MS);
    return { created: true, cached: false, ata };
  })()
    .finally(() => {
      ataEnsureInFlight.delete(key);
    });

  ataEnsureInFlight.set(key, promise);
  return promise;
}

// ─── SDK-facing: challenge ────────────────────────────────────────────────

/**
 * POST /v1/challenge
 *
 * Body: {
 *   walletAddress, network?, usdcMint?, resource, basePriceMicroUsdc?, bot?,
 *   ensureTreasuryAta? (default true)
 * }
 *
 * Returns the x402 envelope the SDK should respond with (HTTP 402).
 */
router.post("/challenge", async (req, res, next) => {
  try {
    const {
      walletAddress,
      network: rawNetwork,
      usdcMint,
      resource,
      basePriceMicroUsdc,
      bot,
      ensureTreasuryAta: shouldEnsureAta = true,
    } = req.body || {};

    if (!isLikelySolanaAddress(walletAddress)) {
      return res.status(400).json({ error: "Valid walletAddress is required" });
    }
    if (!resource || typeof resource !== "string") {
      return res.status(400).json({ error: "resource is required" });
    }

    const network = rawNetwork || "devnet";
    const ctx = buildWalletContext({ walletAddress, network, usdcMint });
    const price = Number(basePriceMicroUsdc || 1000);
    let ataEnsure = null;
    if (shouldEnsureAta !== false) {
      ataEnsure = await ensureTreasuryAta({ ctx, walletAddress });
    }

    const challenge = createPaymentChallenge({
      resource,
      walletAddress,
      network: ctx.network,
      usdcMint: ctx.usdcMint.toString(),
      requiredMicroUsdc: price,
    });

    return res.json({
      x402Version: 1,
      accepts: [
        {
          scheme: "exact",
          network: x402Network(ctx.network),
          maxAmountRequired: String(price),
          resource,
          description: `AI crawler access to ${resource}`,
          mimeType: "application/json",
          outputSchema: null,
          payTo: ctx.treasuryAta.toString(),
          maxTimeoutSeconds: 300,
          asset: ctx.usdcMint.toString(),
        },
      ],
      crawlpay: {
        bot: bot || null,
        wallet_address: walletAddress,
        network: ctx.network,
        base_price_micro_usdc: price,
        treasury_ata: {
          address: ctx.treasuryAta.toString(),
          ensured: Boolean(ataEnsure),
          created: ataEnsure?.created || false,
        },
        challenge: {
          token: challenge.token,
          nonce: challenge.nonce,
          resource: challenge.resource,
          expires_at: challenge.expiresAt,
          header_name: "x-paywall-challenge",
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── SDK-facing: verify ──────────────────────────────────────────────────

/**
 * POST /v1/verify
 *
 * Body: {
 *   walletAddress, network?, usdcMint?,
 *   paymentHeader, resource, challengeToken?,
 *   requiredMicroUsdc?, meta?
 * }
 */
router.post("/verify", async (req, res, next) => {
  try {
    const {
      walletAddress,
      network: rawNetwork,
      usdcMint,
      paymentHeader,
      resource,
      challengeToken,
      requiredMicroUsdc,
      meta,
    } = req.body || {};

    if (!isLikelySolanaAddress(walletAddress)) {
      return res.status(400).json({ error: "Valid walletAddress is required" });
    }
    if (!paymentHeader || !resource) {
      return res.status(400).json({ error: "paymentHeader and resource are required" });
    }

    const network = rawNetwork || "devnet";
    const price = Number(requiredMicroUsdc || 1000);

    const result = await verifyPaymentForWallet({
      walletAddress,
      network,
      usdcMint,
      paymentHeader,
      resource,
      requiredMicroUsdc: price,
      challengeTokenFromHeader: challengeToken,
    });

    if (result.verified && result.signature) {
      try {
        await recordWalletPayment({
          walletAddress,
          network: result.network || network,
          tx: result.signature,
          botName: meta?.botName || null,
          userAgent: meta?.userAgent || null,
          path: resource,
          pageHash: resource,
          lamports: result.received || price,
          relevanceScore: meta?.relevanceScore || null,
          contentType: meta?.contentType || null,
          botMultiplier: meta?.botMultiplier || null,
          exclusivityMod: meta?.exclusivityMod || null,
        });
      } catch (err) {
        console.warn("Failed to record wallet payment:", err.message);
      }
    }

    if (result.verified) {
      return res.json({
        verified: true,
        received: result.received,
        signature: result.signature,
        payer: result.payer,
        network: result.network,
      });
    }
    return res.status(403).json({ verified: false, error: result.error });
  } catch (err) {
    next(err);
  }
});

// ─── Dashboard auth: nonce + session ──────────────────────────────────────

/**
 * POST /v1/auth/nonce
 *
 * Body: { walletAddress }
 * Returns: { token, message, expiresAt }
 *
 * The client signs `message` with the wallet's private key and POSTs the
 * signature back to /v1/auth/verify along with the opaque `token`.
 */
router.post("/auth/nonce", (req, res, next) => {
  try {
    const { walletAddress } = req.body || {};
    if (!isLikelySolanaAddress(walletAddress)) {
      return res.status(400).json({ error: "Valid walletAddress is required" });
    }
    const challenge = issueLoginChallenge({ walletAddress });
    res.json(challenge);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /v1/auth/verify
 *
 * Body: { walletAddress, message, signature, token }
 * Returns: { session, walletAddress, expiresAt }
 */
router.post("/auth/verify", (req, res, next) => {
  try {
    const result = verifyLoginAndIssueSession(req.body || {});
    if (!result.ok) return res.status(401).json({ error: result.error });
    res.json({
      session: result.session,
      walletAddress: result.walletAddress,
      expiresAt: result.expiresAt,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Dashboard: wallet-scoped analytics ──────────────────────────────────

/**
 * GET /v1/dashboard
 *
 * Auth: Bearer <session>
 *
 * Returns analytics for the wallet that the session represents.
 */
router.get("/dashboard", requireWalletSession, async (req, res, next) => {
  try {
    const wallet = req.walletAddress;
    const [payments, totalLamports] = await Promise.all([
      getWalletPayments(wallet),
      getWalletTotalLamports(wallet),
    ]);
    res.json({
      wallet: {
        address: wallet,
      },
      total: payments.length,
      total_lamports: totalLamports,
      payments,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /v1/wallet/treasury?walletAddress=...&network=...
 *
 * Convenience endpoint: returns the deterministic USDC ATA for a wallet so
 * users can sanity-check where payments will land before going live.
 */
router.get("/wallet/treasury", (req, res, next) => {
  try {
    const walletAddress = String(req.query.walletAddress || "");
    const network = String(req.query.network || "devnet");
    const usdcMint = req.query.usdcMint ? String(req.query.usdcMint) : undefined;
    if (!isLikelySolanaAddress(walletAddress)) {
      return res.status(400).json({ error: "Valid walletAddress is required" });
    }
    const ctx = buildWalletContext({ walletAddress, network, usdcMint });
    res.json({
      walletAddress,
      network: ctx.network,
      usdcMint: ctx.usdcMint.toString(),
      treasuryAta: ctx.treasuryAta.toString(),
      defaultUsdcMint: resolveUsdcMint({ network: ctx.network }),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
