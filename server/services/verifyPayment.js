/**
 * x402 payment verification — hand-rolled because @x402-solana/core@0.3.2's
 * transaction parser is broken for our use case. Specifically,
 * `extractUSDCTransfers` calls `Buffer.from(ix.data)` on RPC instruction data
 * that arrives as a base58-encoded string, so the discriminator check fails
 * and the verifier reports "No USDC transfer found in transaction" even when
 * a perfectly valid USDC transfer is on-chain.
 *
 * We still use the SDK's `parseX402Payment` for header parsing — that part
 * works — and we still produce/consume spec-compliant x402 envelopes. The
 * only thing we replace is the "did this transaction actually move the right
 * amount of USDC to the right ATA?" check, which we do directly against
 * `meta.preTokenBalances` / `meta.postTokenBalances` from the RPC. Token
 * balance deltas don't lie.
 *
 * Replay protection comes from `payments.js`'s shared-database-backed
 * `isTxCached` / `cacheTx`, which survives server restarts unlike an in-memory map.
 */

import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { parseX402Payment } from '@x402-solana/core';
import bs58 from 'bs58';

import { isTxCached, cacheTx } from '../data/payments.js';
import { verifyPaymentChallenge } from './paymentChallenge.js';

const NETWORK = process.env.SOLANA_NETWORK || 'devnet';

// Canonical USDC mints. Override either via $USDC_MINT (any network) for tests.
const USDC_MINT_DEVNET  = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'; // Circle's devnet faucet mint
const USDC_MINT_MAINNET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDC_MINT = new PublicKey(
  process.env.USDC_MINT
  || (NETWORK === 'mainnet-beta' ? USDC_MINT_MAINNET : USDC_MINT_DEVNET),
);

const connection = new Connection(process.env.SOLANA_RPC_URL, 'confirmed');
const walletPubkey = new PublicKey(process.env.WALLET_ADDRESS);
const treasuryUsdcAta = getAssociatedTokenAddressSync(USDC_MINT, walletPubkey);

// 5-minute window matches what most x402 implementations enforce.
const MAX_PAYMENT_AGE_MS = 5 * 60 * 1000;

export function getTreasuryUsdcAta() { return treasuryUsdcAta.toString(); }
export function getUsdcMintAddress() { return USDC_MINT.toString(); }
export function getNetwork()         { return NETWORK; }

function extractSignatureFromSerialized(serializedB64) {
  const buf = Buffer.from(serializedB64, 'base64');
  try {
    const v = VersionedTransaction.deserialize(buf);
    return v.signatures[0] ? bs58.encode(v.signatures[0]) : null;
  } catch {
    try {
      const t = Transaction.from(buf);
      const sig = t.signatures[0]?.signature;
      return sig ? bs58.encode(sig) : null;
    } catch {
      return null;
    }
  }
}

async function fetchTxWithRetry(signature, attempts = 8, delayMs = 500) {
  for (let i = 0; i < attempts; i++) {
    const tx = await connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
    if (tx) return tx;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

/**
 * Verify an x402 payment header against per-request requirements.
 *
 * @param {string|undefined} paymentHeader   Raw `X-PAYMENT` request header.
 * @param {string} _resource                 Path being paid for (unused for verification today,
 *                                           but kept in the signature so a future binding check
 *                                           against an in-payload `resource` field can be added).
 * @param {number|string} maxAmountMicroUsdc Required price in micro-USDC (1e6 = $1).
 */
export async function verifyPayment(paymentHeader, resource, maxAmountMicroUsdc, challengeTokenFromHeader) {
  try {
    return await verifyPaymentInner(
      paymentHeader,
      resource,
      maxAmountMicroUsdc,
      challengeTokenFromHeader,
    );
  } catch (err) {
    // Defensive — never let RPC/network errors crash the request handler.
    return { verified: false, error: `Verification error: ${err.message}` };
  }
}

function extractChallengeTokenFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  return payload.challengeToken
    || payload.challenge_token
    || payload?.metadata?.challengeToken
    || payload?.metadata?.challenge_token
    || payload?.metadata?.crawlpay?.challengeToken
    || payload?.metadata?.crawlpay?.challenge_token
    || payload?.crawlpay?.challengeToken
    || payload?.crawlpay?.challenge_token
    || null;
}

async function verifyPaymentInner(paymentHeader, resource, maxAmountMicroUsdc, challengeTokenFromHeader) {
  if (!paymentHeader) {
    return { verified: false, error: 'Missing X-PAYMENT header' };
  }

  const parsed = parseX402Payment(paymentHeader);
  if (!parsed.success) {
    return { verified: false, error: `Invalid X-PAYMENT header: ${parsed.error}` };
  }
  const payment = parsed.payment;

  if (payment.scheme !== 'exact') {
    return { verified: false, error: `Unsupported payment scheme: ${payment.scheme}` };
  }

  const challengeTokenFromPayload = extractChallengeTokenFromPayload(payment.payload);
  const challengeToken = challengeTokenFromPayload || challengeTokenFromHeader;
  const challengeCheck = verifyPaymentChallenge(challengeToken, resource);
  if (!challengeCheck.ok) {
    return { verified: false, error: `Invalid payment challenge: ${challengeCheck.error}` };
  }

  let signature = payment.payload.signature || null;
  if (!signature && payment.payload.serializedTransaction) {
    signature = extractSignatureFromSerialized(payment.payload.serializedTransaction);
  }
  if (!signature) {
    return { verified: false, error: 'Could not extract transaction signature from payment' };
  }

  if (await isTxCached(signature)) {
    return { verified: false, error: 'Replay: this transaction has already been redeemed' };
  }

  // If the client pre-submitted (our test client does), the tx is already on-chain.
  // If they didn't, submit on their behalf — that's the x402 facilitator role.
  let tx = await connection.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });

  if (!tx && payment.payload.serializedTransaction) {
    try {
      const buf = Buffer.from(payment.payload.serializedTransaction, 'base64');
      await connection.sendRawTransaction(buf);
    } catch {
      // Most failures here mean the tx is already on-chain or rejected; fall through
      // to fetch and let the success/age/balance checks decide.
    }
    tx = await fetchTxWithRetry(signature);
  }

  if (!tx) {
    return { verified: false, error: `Transaction ${signature} not found on ${NETWORK}` };
  }
  if (tx.meta?.err) {
    return { verified: false, error: `Transaction failed on-chain: ${JSON.stringify(tx.meta.err)}` };
  }

  if (tx.blockTime) {
    const ageMs = Date.now() - tx.blockTime * 1000;
    if (ageMs > MAX_PAYMENT_AGE_MS) {
      return {
        verified: false,
        error: `Transaction too old: ${Math.round(ageMs / 1000)}s > ${MAX_PAYMENT_AGE_MS / 1000}s`,
      };
    }
  }

  // Resolve account-index → pubkey for both legacy and versioned messages.
  const message = tx.transaction.message;
  const accountKeys = message.staticAccountKeys || message.accountKeys || [];
  const keyAt = (i) => {
    const k = accountKeys[i];
    return typeof k === 'string' ? k : k?.toString();
  };

  const treasury = treasuryUsdcAta.toString();
  const mint = USDC_MINT.toString();

  const findBalance = (balances) =>
    (balances || []).find((b) => keyAt(b.accountIndex) === treasury && b.mint === mint);

  const post = findBalance(tx.meta?.postTokenBalances);
  if (!post) {
    return {
      verified: false,
      error: `Transaction does not touch treasury ATA ${treasury} for mint ${mint}`,
    };
  }
  const pre = findBalance(tx.meta?.preTokenBalances);

  const preAmt  = pre ? Number(pre.uiTokenAmount.amount)  : 0;
  const postAmt = Number(post.uiTokenAmount.amount);
  const delta   = postAmt - preAmt;

  const required = Number(maxAmountMicroUsdc);
  if (delta < required) {
    return {
      verified: false,
      error: `Underpaid: received ${delta} micro-USDC, required ${required}`,
    };
  }

  // Identify the payer by finding the source ATA — same mint, balance went down.
  const payerEntry = (tx.meta?.preTokenBalances || []).find((b) => {
    if (b.mint !== mint) return false;
    if (keyAt(b.accountIndex) === treasury) return false;
    const matchingPost = (tx.meta?.postTokenBalances || [])
      .find((p) => p.accountIndex === b.accountIndex);
    if (!matchingPost) return false;
    return Number(b.uiTokenAmount.amount) - Number(matchingPost.uiTokenAmount.amount) >= delta;
  });
  const payer = payerEntry?.owner || null;

  await cacheTx(signature);

  return {
    verified: true,
    received: delta,
    payer,
    signature,
    challengeNonce: challengeCheck.nonce,
  };
}
