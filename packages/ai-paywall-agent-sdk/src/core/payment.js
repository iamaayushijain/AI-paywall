/**
 * Build, sign, and submit the USDC SPL transfer the 402 envelope demands,
 * then mint the matching x402 `X-PAYMENT` header.
 *
 * Mirrors the reference flow in `e2e-sdk-flow.js` but factored so callers
 * just hand in the parsed `accept` clause and a signer.
 */

import {
  Connection,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { createSolanaPaymentHeaderWithTransaction } from "@x402-solana/core";

import { OnChainError } from "./errors.js";

const USDC_DECIMALS = 6;

export function defaultRpcUrl(network) {
  if (network === "mainnet-beta") return "https://api.mainnet-beta.solana.com";
  if (network === "testnet") return "https://api.testnet.solana.com";
  return "https://api.devnet.solana.com";
}

export function makeConnection({ rpcUrl, network, commitment = "confirmed" }) {
  return new Connection(rpcUrl || defaultRpcUrl(network), commitment);
}

/**
 * Confirm the payer's USDC ATA exists and has enough funds.
 * Throws OnChainError if not.
 */
export async function assertPayerCanCover({
  connection,
  payerPublicKey,
  usdcMint,
  amountMicroUsdc,
}) {
  const ata = getAssociatedTokenAddressSync(usdcMint, payerPublicKey);
  try {
    const acct = await getAccount(connection, ata);
    const have = Number(acct.amount);
    if (have < amountMicroUsdc) {
      throw new OnChainError(
        `Payer USDC balance ${have} micro-USDC < required ${amountMicroUsdc}.`,
        { ata: ata.toString(), have, need: amountMicroUsdc },
      );
    }
    return { ata, balance: have };
  } catch (err) {
    if (err instanceof OnChainError) throw err;
    throw new OnChainError(
      `Payer USDC ATA missing or unreadable at ${ata.toString()}. Fund USDC first.`,
      { ata: ata.toString(), cause: err.message },
    );
  }
}

/**
 * Build, sign, and submit a USDC transfer for the given accept clause, then
 * return the x402 `X-PAYMENT` header value plus the on-chain signature.
 */
export async function buildAndSubmitPayment({
  connection,
  signer,
  accept,
  amountMicroUsdc,
  commitment = "confirmed",
}) {
  const usdcMint = new PublicKey(accept.asset);
  const recipientAta = new PublicKey(accept.payTo);
  const payerAta = getAssociatedTokenAddressSync(usdcMint, signer.publicKey);

  const ix = createTransferCheckedInstruction(
    payerAta,
    usdcMint,
    recipientAta,
    signer.publicKey,
    BigInt(amountMicroUsdc),
    USDC_DECIMALS,
    [],
    TOKEN_PROGRAM_ID,
  );

  let blockhash;
  let lastValidBlockHeight;
  try {
    ({ blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash());
  } catch (err) {
    throw new OnChainError("Failed to fetch latest blockhash", { cause: err.message });
  }

  const tx = new Transaction({
    recentBlockhash: blockhash,
    feePayer: signer.publicKey,
  }).add(ix);

  await signer.signTransaction(tx);

  let signature;
  try {
    signature = await connection.sendRawTransaction(tx.serialize());
  } catch (err) {
    throw new OnChainError(`sendRawTransaction failed: ${err.message}`, {
      cause: err.message,
    });
  }

  try {
    await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      commitment,
    );
  } catch (err) {
    throw new OnChainError(`confirmTransaction failed: ${err.message}`, {
      signature,
      cause: err.message,
    });
  }

  const serializedB64 = tx
    .serialize({ requireAllSignatures: false })
    .toString("base64");

  const xPayment = createSolanaPaymentHeaderWithTransaction(
    serializedB64,
    accept.network,
  );

  return { signature, xPayment };
}
