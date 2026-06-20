/**
 * Signer abstractions.
 *
 * The agent SDK never holds a private key it doesn't have to. Callers supply
 * a `signer` that knows how to:
 *   1. expose the payer's public key
 *   2. sign a Solana `Transaction`
 *
 * Built-in helpers cover the common cases:
 *   - fromKeypair(kp)              — pass a `@solana/web3.js` Keypair directly
 *   - fromSecretKeyArray(arr)      — Uint8Array / number[] (Solana CLI JSON)
 *   - fromSecretKeyBase58(b58)     — base58-encoded 64-byte secret
 *   - fromKeypairFile(path?)       — read CLI keypair JSON (default: ~/.config/solana/id.json)
 *
 * For HSM / KMS / browser-wallet integrations, build your own:
 *
 *   const signer = {
 *     publicKey,                    // PublicKey
 *     async signTransaction(tx) {   // returns the same tx, signed
 *       ...
 *       return tx;
 *     },
 *   };
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Keypair, PublicKey } from "@solana/web3.js";

function isSignerLike(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.signTransaction === "function" &&
    value.publicKey instanceof PublicKey
  );
}

export function fromKeypair(keypair) {
  if (!keypair || typeof keypair.secretKey === "undefined") {
    throw new Error("fromKeypair: expected a @solana/web3.js Keypair");
  }
  return {
    publicKey: keypair.publicKey,
    async signTransaction(tx) {
      tx.partialSign(keypair);
      return tx;
    },
  };
}

export function fromSecretKeyArray(arr) {
  if (!arr || (!Array.isArray(arr) && !(arr instanceof Uint8Array))) {
    throw new Error("fromSecretKeyArray: expected number[] or Uint8Array");
  }
  const kp = Keypair.fromSecretKey(Uint8Array.from(arr));
  return fromKeypair(kp);
}

export async function fromSecretKeyBase58(b58) {
  if (typeof b58 !== "string" || b58.length < 64) {
    throw new Error("fromSecretKeyBase58: expected a base58 string");
  }
  const { default: bs58 } = await import("bs58").catch(() => ({ default: null }));
  if (!bs58) {
    throw new Error(
      "fromSecretKeyBase58 requires the optional dependency `bs58`. Install it: npm i bs58",
    );
  }
  const kp = Keypair.fromSecretKey(bs58.decode(b58.trim()));
  return fromKeypair(kp);
}

/**
 * Read a keypair from the local filesystem. Defaults to the Solana CLI
 * default location at `~/.config/solana/id.json`.
 *
 * @param {string} [keypairPath]
 */
export function fromKeypairFile(keypairPath) {
  const resolved =
    keypairPath || path.join(os.homedir(), ".config", "solana", "id.json");
  if (!fs.existsSync(resolved)) {
    throw new Error(`fromKeypairFile: no keypair at ${resolved}`);
  }
  const raw = fs.readFileSync(resolved, "utf8");
  const arr = JSON.parse(raw);
  return fromSecretKeyArray(arr);
}

/**
 * Resolve any signer-like value into the canonical signer shape.
 * Accepts either a `Keypair` or an already-built signer.
 */
export function resolveSigner(input) {
  if (!input) {
    throw new Error(
      "createAgentPaywallClient requires a `signer`. Pass a Keypair, a signer object, or use one of the helpers (fromKeypair / fromKeypairFile / fromSecretKeyArray / fromSecretKeyBase58).",
    );
  }
  if (isSignerLike(input)) return input;
  if (typeof input.secretKey !== "undefined") return fromKeypair(input);
  throw new Error(
    "Unrecognized signer. Must be a Keypair or { publicKey, signTransaction }.",
  );
}
