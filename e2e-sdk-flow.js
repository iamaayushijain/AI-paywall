import "dotenv/config";
import fs from "node:fs";
import os from "node:os";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createTransferCheckedInstruction,
  TOKEN_PROGRAM_ID,
  getAccount,
} from "@solana/spl-token";
import { createSolanaPaymentHeaderWithTransaction } from "@x402-solana/core";

const BASE_URL = process.env.CONSUMER_URL || "http://localhost:4010";
const SOLANA_NETWORK = process.env.SOLANA_NETWORK || "devnet";
const X402_NETWORK =
  SOLANA_NETWORK === "mainnet-beta" ? "solana-mainnet" : `solana-${SOLANA_NETWORK}`;

const USDC_MINT = new PublicKey(
  process.env.USDC_MINT || "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
);

const RPC_URL =
  process.env.SOLANA_RPC_URL ||
  (SOLANA_NETWORK === "mainnet-beta"
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com");

const connection = new Connection(RPC_URL, "confirmed");

// Uses your default Solana CLI keypair: ~/.config/solana/id.json
const payerSecret = JSON.parse(
  fs.readFileSync(`${os.homedir()}/.config/solana/id.json`, "utf8")
);
const payer = Keypair.fromSecretKey(Uint8Array.from(payerSecret));
const payerAta = getAssociatedTokenAddressSync(USDC_MINT, payer.publicKey);

async function ensurePayerUsdc() {
  try {
    const acct = await getAccount(connection, payerAta);
    const micro = Number(acct.amount);
    console.log(`Payer: ${payer.publicKey.toString()}`);
    console.log(`Payer ATA: ${payerAta.toString()}`);
    console.log(`Payer USDC: ${micro} micro-USDC`);
    if (micro <= 0) throw new Error("No USDC in payer ATA");
  } catch (e) {
    throw new Error(
      `Payer USDC ATA missing/empty at ${payerAta.toString()}. Fund devnet USDC first.`
    );
  }
}

async function buildAndSendPaymentHeader({ payToAta, amountMicroUsdc }) {
  const recipientAta = new PublicKey(payToAta);

  const ix = createTransferCheckedInstruction(
    payerAta,
    USDC_MINT,
    recipientAta,
    payer.publicKey,
    BigInt(amountMicroUsdc),
    6,
    [],
    TOKEN_PROGRAM_ID
  );

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

  const tx = new Transaction({
    recentBlockhash: blockhash,
    feePayer: payer.publicKey,
  }).add(ix);

  tx.sign(payer);

  // Submit on-chain first (verifier can then fetch tx by signature)
  const signature = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed"
  );

  // Build x402 payment header from serialized transaction
  const serializedB64 = tx
    .serialize({ requireAllSignatures: false })
    .toString("base64");

  const xPayment = createSolanaPaymentHeaderWithTransaction(
    serializedB64,
    X402_NETWORK
  );

  return { xPayment, signature };
}

async function run() {
  const targetPath = process.env.PROTECTED_PATH || "/articles/test";
  const targetUrl = `${BASE_URL}${targetPath}`;

  await ensurePayerUsdc();

  console.log("\n1) Request protected route as bot...");
  const r1 = await fetch(targetUrl, {
    headers: { "User-Agent": "GPTBot" },
  });

  const body1 = await r1.json();
  if (r1.status !== 402) {
    throw new Error(`Expected 402, got ${r1.status}: ${JSON.stringify(body1)}`);
  }

  const accept = body1?.accepts?.[0];
  const challengeToken = body1?.crawlpay?.challenge?.token;

  if (!accept?.payTo) throw new Error("Missing accepts[0].payTo in 402");
  if (!accept?.maxAmountRequired) throw new Error("Missing maxAmountRequired in 402");
  if (!challengeToken) throw new Error("Missing crawlpay.challenge.token in 402");

  const amountMicroUsdc = Number(accept.maxAmountRequired);

  console.log("402 received:");
  console.log(`- payTo ATA: ${accept.payTo}`);
  console.log(`- amount: ${amountMicroUsdc} micro-USDC`);
  console.log(`- asset: ${accept.asset}`);
  console.log(`- network: ${accept.network}`);

  console.log("\n2) Build/send payment tx and create X-PAYMENT...");
  const { xPayment, signature } = await buildAndSendPaymentHeader({
    payToAta: accept.payTo,
    amountMicroUsdc,
  });

  console.log(`Payment tx signature: ${signature}`);
  console.log(`X-PAYMENT length: ${xPayment.length}`);

  console.log("\n3) Retry protected route with payment headers...");
  const r2 = await fetch(targetUrl, {
    headers: {
      "User-Agent": "GPTBot",
      "X-PAYMENT": xPayment,
      "x-paywall-challenge": challengeToken,
    },
  });

  const body2 = await r2.json();
  console.log(`Retry status: ${r2.status}`);
  console.log("Unlocked response:", JSON.stringify(body2, null, 2));

  if (r2.status !== 200) {
    throw new Error(`Expected 200 after payment, got ${r2.status}`);
  }

  console.log("\n✓ End-to-end paywall flow passed");
  console.log(`✓ Signature: ${signature}`);
}

run().catch((err) => {
  console.error("E2E failed:", err.message);
  process.exit(1);
});