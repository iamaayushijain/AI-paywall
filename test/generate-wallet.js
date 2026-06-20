/**
 * Generate a fresh Solana keypair for use as the treasury wallet.
 * Run once: node test/generate-wallet.js
 * Then paste the public key into .env as WALLET_ADDRESS.
 */
import { Keypair } from "@solana/web3.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const keypair = Keypair.generate();

console.log("=== New Solana Devnet Wallet ===");
console.log(`Public Key:  ${keypair.publicKey.toBase58()}`);
console.log(`Secret Key:  [${keypair.secretKey.toString()}]`);

// Save keypair to a file so the e2e test can use it as the treasury
const keypairPath = path.join(__dirname, "treasury-keypair.json");
fs.writeFileSync(keypairPath, JSON.stringify(Array.from(keypair.secretKey)));
console.log(`\nKeypair saved to: ${keypairPath}`);
console.log(`\nUpdate your .env:`);
console.log(`  WALLET_ADDRESS=${keypair.publicKey.toBase58()}`);
