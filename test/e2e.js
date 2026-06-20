/**
 * End-to-end test for the x402 paywall.
 *
 * Flow:
 *   1. Hit a page as a bot → expect HTTP 402 with x402 payment requirements.
 *   2. Build & sign a USDC SPL-token transfer matching those requirements.
 *   3. Encode it as an x402 X-PAYMENT header and retry.
 *   4. Expect 200 + content unlocked, and confirm the dashboard recorded it.
 *
 * Prerequisites:
 *   - ~/.config/solana/id.json funded with devnet SOL (for fees).
 *   - Payer wallet holds devnet USDC from Circle's faucet:
 *       https://faucet.circle.com/   (mint 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU)
 *   - The server boots with an ATA already created for the treasury wallet at
 *     the same mint. `server/services/verifyPayment.js` derives & reports it
 *     at startup; create it once with `spl-token create-account <mint> --owner <wallet>`
 *     if it doesn't exist yet. This test does NOT auto-create the treasury ATA.
 */

import 'dotenv/config';
import fs from 'fs';
import os from 'os';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  createTransferCheckedInstruction,
  TOKEN_PROGRAM_ID,
  getAccount,
} from '@solana/spl-token';
import { createSolanaPaymentHeaderWithTransaction } from '@x402-solana/core';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const INTERNAL_NET = process.env.SOLANA_NETWORK || 'devnet';
const X402_NET = INTERNAL_NET === 'mainnet-beta' ? 'solana-mainnet' : `solana-${INTERNAL_NET}`;

// Circle's canonical devnet USDC mint (matches the server's override).
const USDC_MINT = new PublicKey(
  process.env.USDC_DEVNET_MINT || '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
);

const connection = new Connection(process.env.SOLANA_RPC_URL, 'confirmed');

const payerSecret = JSON.parse(
  fs.readFileSync(`${os.homedir()}/.config/solana/id.json`, 'utf8'),
);
const payer = Keypair.fromSecretKey(Uint8Array.from(payerSecret));
console.log('Payer:', payer.publicKey.toString());

const payerAta = getAssociatedTokenAddressSync(USDC_MINT, payer.publicKey);

async function checkPayerBalance() {
  try {
    const acct = await getAccount(connection, payerAta);
    const micro = Number(acct.amount);
    console.log(`Payer USDC balance: $${(micro / 1e6).toFixed(6)} (${micro} micro-USDC at ${payerAta.toString()})`);
    return micro;
  } catch {
    console.warn(
      `⚠  Payer has no USDC ATA at ${payerAta.toString()}.\n`
      + '   Get devnet USDC from https://faucet.circle.com/ (paste your wallet address),\n'
      + `   or create the ATA manually: spl-token create-account ${USDC_MINT.toString()}`,
    );
    return 0;
  }
}

async function buildX402Payment(payToAta, amountMicroUsdc) {
  const recipientAta = new PublicKey(payToAta);

  const ix = createTransferCheckedInstruction(
    payerAta,
    USDC_MINT,
    recipientAta,
    payer.publicKey,
    BigInt(amountMicroUsdc),
    6,
    [],
    TOKEN_PROGRAM_ID,
  );

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

  const tx = new Transaction({
    recentBlockhash: blockhash,
    feePayer: payer.publicKey,
  });

  tx.add(ix);
  tx.sign(payer);

  // 🔥 NEW: send transaction to blockchain
  const signature = await connection.sendRawTransaction(tx.serialize());
  console.log("  Sent tx:", signature);

  // 🔥 NEW: wait for confirmation
  await connection.confirmTransaction(
    {
      signature,
      blockhash,
      lastValidBlockHeight,
    },
    "confirmed"
  );
  console.log("  Confirmed tx");

  // Optional: small delay for RPC indexing
  await new Promise((r) => setTimeout(r, 1000));

  // Now serialize for x402 header
  const serialized = tx.serialize({ requireAllSignatures: false }).toString('base64');

  return createSolanaPaymentHeaderWithTransaction(serialized, X402_NET);
}

async function runTest() {
  const testPath = '/blog/ai-data-pricing-test';

  const balance = await checkPayerBalance();
  if (balance === 0) {
    throw new Error('Payer has no USDC — fund from https://faucet.circle.com/ and retry.');
  }

  console.log('\n1. Requesting page as AI bot...');
  const r1 = await fetch(`${BASE_URL}${testPath}`, {
    headers: { 'User-Agent': 'GPTBot' },
  });
  console.log('  Status:', r1.status);
  const r1Body = await r1.json();
  console.log('  402 response:', JSON.stringify(r1Body, null, 2));
  if (r1.status !== 402) throw new Error(`Expected 402, got ${r1.status}`);

  const accept = r1Body.accepts[0];
  const challengeToken = r1Body?.crawlpay?.challenge?.token;
  if (!challengeToken) {
    throw new Error('Missing crawlpay.challenge.token in 402 response');
  }

  console.log('\n2. Building x402 payment...');
  const xPayment = await buildX402Payment(accept.payTo, accept.maxAmountRequired);
  console.log('  Header length:', xPayment.length, 'bytes');

  console.log('\n3. Retrying with x-payment header...');
  const r2 = await fetch(`${BASE_URL}${testPath}`, {
    headers: {
      'User-Agent': 'GPTBot',
      'x-payment':  xPayment,
      'x-paywall-challenge': challengeToken,
    },
  });
  console.log('  Status:', r2.status);
  const r2Body = await r2.json();
  console.log('  Response:', JSON.stringify(r2Body, null, 2));
  if (r2.status !== 200) throw new Error(`Expected 200, got ${r2.status}: ${r2Body.error}`);

  console.log('\n4. Checking dashboard...');
  const dash = await (await fetch(`${BASE_URL}/v1/dashboard`)).json();
  console.log("Dashboard response:", dash);
  console.log('  Total payments:', dash.total);
  console.log('  Latest:', dash.payments[0]);

  console.log('\n✓ End-to-end test passed');
}

runTest().catch((err) => {
  console.error('Test failed:', err.message);
  process.exit(1);
});
