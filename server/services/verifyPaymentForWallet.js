/**
 * Stateless x402 payment verification for an arbitrary wallet.
 *
 * The SDK declares which wallet should receive the payment per request — we
 * derive its USDC ATA on the fly and check the on-chain transfer against
 * that. No tenants, no API keys, no central state per customer.
 *
 * Reuses semantics from the legacy `verifyPayment.js`: parses the x402
 * `X-PAYMENT` envelope, validates the challenge binding, fetches the tx
 * from RPC (submitting it on the client's behalf if needed), then enforces
 * recipient ATA + amount + replay-protection.
 */

import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { parseX402Payment } from "@x402-solana/core";
import bs58 from "bs58";

import { isTxCachedGlobal, cacheTxGlobal } from "../data/wallets.js";
import { verifyPaymentChallenge } from "./paymentChallenge.js";

const USDC_MINT_DEVNET  = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const USDC_MINT_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const MAX_PAYMENT_AGE_MS = 5 * 60 * 1000;

const rpcCache = new Map();
function rpcUrlFor(network) {
  const fromEnv = process.env.SOLANA_RPC_URL;
  if (fromEnv) return fromEnv;
  if (network === "mainnet-beta") return "https://api.mainnet-beta.solana.com";
  return "https://api.devnet.solana.com";
}

export function resolveUsdcMint({ network, usdcMint }) {
  if (usdcMint) return usdcMint;
  return network === "mainnet-beta" ? USDC_MINT_MAINNET : USDC_MINT_DEVNET;
}

export function buildWalletContext({ walletAddress, network, usdcMint }) {
  const net = network || "devnet";
  const mintAddress = resolveUsdcMint({ network: net, usdcMint });
  const mintPk = new PublicKey(mintAddress);
  const walletPk = new PublicKey(walletAddress);
  const treasuryAta = getAssociatedTokenAddressSync(mintPk, walletPk);

  const rpcUrl = rpcUrlFor(net);
  let connection = rpcCache.get(rpcUrl);
  if (!connection) {
    connection = new Connection(rpcUrl, "confirmed");
    rpcCache.set(rpcUrl, connection);
  }

  return {
    network: net,
    usdcMint: mintPk,
    walletAddress: walletPk.toString(),
    treasuryAta,
    connection,
  };
}

function extractSignatureFromSerialized(serializedB64) {
  const buf = Buffer.from(serializedB64, "base64");
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

async function fetchTxWithRetry(connection, signature, attempts = 8, delayMs = 500) {
  for (let i = 0; i < attempts; i++) {
    const tx = await connection.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (tx) return tx;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

function extractChallengeTokenFromPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  return (
    payload.challengeToken
    || payload.challenge_token
    || payload?.metadata?.challengeToken
    || payload?.metadata?.challenge_token
    || payload?.metadata?.crawlpay?.challengeToken
    || payload?.metadata?.crawlpay?.challenge_token
    || null
  );
}

export async function verifyPaymentForWallet({
  walletAddress,
  network,
  usdcMint,
  paymentHeader,
  resource,
  requiredMicroUsdc,
  challengeTokenFromHeader,
}) {
  try {
    return await verifyInner({
      walletAddress,
      network,
      usdcMint,
      paymentHeader,
      resource,
      requiredMicroUsdc,
      challengeTokenFromHeader,
    });
  } catch (err) {
    return { verified: false, error: `Verification error: ${err.message}` };
  }
}

async function verifyInner({
  walletAddress,
  network,
  usdcMint,
  paymentHeader,
  resource,
  requiredMicroUsdc,
  challengeTokenFromHeader,
}) {
  if (!paymentHeader) {
    return { verified: false, error: "Missing X-PAYMENT header" };
  }
  if (!walletAddress) {
    return { verified: false, error: "Missing walletAddress" };
  }

  const ctx = buildWalletContext({ walletAddress, network, usdcMint });

  const parsed = parseX402Payment(paymentHeader);
  if (!parsed.success) {
    return { verified: false, error: `Invalid X-PAYMENT header: ${parsed.error}` };
  }
  const payment = parsed.payment;

  if (payment.scheme !== "exact") {
    return { verified: false, error: `Unsupported payment scheme: ${payment.scheme}` };
  }

  const challengeToken =
    extractChallengeTokenFromPayload(payment.payload) || challengeTokenFromHeader;
  const challengeCheck = verifyPaymentChallenge(challengeToken, {
    resource,
    walletAddress,
    network: ctx.network,
    usdcMint: ctx.usdcMint.toString(),
    requiredMicroUsdc,
  });
  if (!challengeCheck.ok) {
    return { verified: false, error: `Invalid payment challenge: ${challengeCheck.error}` };
  }

  let signature = payment.payload.signature || null;
  if (!signature && payment.payload.serializedTransaction) {
    signature = extractSignatureFromSerialized(payment.payload.serializedTransaction);
  }
  if (!signature) {
    return { verified: false, error: "Could not extract transaction signature from payment" };
  }

  if (await isTxCachedGlobal(signature)) {
    return { verified: false, error: "Replay: this transaction has already been redeemed" };
  }

  let tx = await ctx.connection.getTransaction(signature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });

  if (!tx && payment.payload.serializedTransaction) {
    try {
      const buf = Buffer.from(payment.payload.serializedTransaction, "base64");
      await ctx.connection.sendRawTransaction(buf);
    } catch {
      // submission may fail if already on-chain — fall through to fetch retry
    }
    tx = await fetchTxWithRetry(ctx.connection, signature);
  }

  if (!tx) {
    return { verified: false, error: `Transaction ${signature} not found on ${ctx.network}` };
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

  const message = tx.transaction.message;
  const accountKeys = message.staticAccountKeys || message.accountKeys || [];
  const keyAt = (i) => {
    const k = accountKeys[i];
    return typeof k === "string" ? k : k?.toString();
  };

  const treasury = ctx.treasuryAta.toString();
  const mint = ctx.usdcMint.toString();

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
  const preAmt = pre ? Number(pre.uiTokenAmount.amount) : 0;
  const postAmt = Number(post.uiTokenAmount.amount);
  const delta = postAmt - preAmt;

  const required = Number(requiredMicroUsdc);
  if (delta < required) {
    return {
      verified: false,
      error: `Underpaid: received ${delta} micro-USDC, required ${required}`,
    };
  }

  const payerEntry = (tx.meta?.preTokenBalances || []).find((b) => {
    if (b.mint !== mint) return false;
    if (keyAt(b.accountIndex) === treasury) return false;
    const matchingPost = (tx.meta?.postTokenBalances || []).find(
      (p) => p.accountIndex === b.accountIndex,
    );
    if (!matchingPost) return false;
    return (
      Number(b.uiTokenAmount.amount) - Number(matchingPost.uiTokenAmount.amount) >= delta
    );
  });
  const payer = payerEntry?.owner || null;

  await cacheTxGlobal({ walletAddress, tx: signature });

  return {
    verified: true,
    received: delta,
    payer,
    signature,
    network: ctx.network,
    challengeNonce: challengeCheck.nonce,
  };
}
