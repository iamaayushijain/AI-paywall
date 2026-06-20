/**
 * Stateless wallet authentication ("Sign-In With Solana").
 *
 * Flow:
 *   1. Client requests a nonce for their walletAddress
 *      → server returns a `message` (human-readable) + `token` (HMAC-signed
 *        envelope around the nonce, expiry, wallet, domain).
 *   2. Client signs `message` with the wallet's private key (Phantom etc.)
 *      and POSTs back { walletAddress, message, signature, token }.
 *   3. Server verifies:
 *        - the token's HMAC, expiry, and wallet match the request
 *        - the message string matches the one embedded in the token
 *        - the ed25519 signature is valid for that message + wallet pubkey
 *      → returns a session token (HMAC-signed { wallet, exp }).
 *   4. Subsequent dashboard calls send `Authorization: Bearer <session>`.
 *
 * No DB rows: nonces and sessions are HMAC-signed envelopes, like the
 * payment challenge tokens.
 */

import crypto from "node:crypto";
import bs58 from "bs58";
import nacl from "tweetnacl";

const NONCE_TTL_MS    = 5 * 60 * 1000;          // 5 min to sign
const SESSION_TTL_MS  = 24 * 60 * 60 * 1000;    // 24h dashboard session

const SECRET = process.env.PAYWALL_AUTH_SECRET
  || process.env.PAYWALL_CHALLENGE_SECRET
  || "dev-secret-change-me";

const DOMAIN = process.env.PAYWALL_AUTH_DOMAIN || "ai-paywall.dev";

function b64uEncode(s) {
  return Buffer.from(s).toString("base64url");
}
function b64uDecode(s) {
  return Buffer.from(s, "base64url").toString("utf8");
}
function hmac(payloadB64) {
  return crypto.createHmac("sha256", SECRET).update(payloadB64).digest("base64url");
}
function safeEqual(a, b) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}
function signEnvelope(payload) {
  const payloadB64 = b64uEncode(JSON.stringify(payload));
  const sig = hmac(payloadB64);
  return `${payloadB64}.${sig}`;
}
function openEnvelope(token) {
  if (!token || typeof token !== "string") {
    return { ok: false, error: "Missing token" };
  }
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return { ok: false, error: "Malformed token" };
  if (!safeEqual(sig, hmac(payloadB64))) {
    return { ok: false, error: "Invalid token signature" };
  }
  let payload;
  try {
    payload = JSON.parse(b64uDecode(payloadB64));
  } catch {
    return { ok: false, error: "Invalid token payload" };
  }
  if (typeof payload.exp !== "number" || Date.now() > payload.exp) {
    return { ok: false, error: "Token expired" };
  }
  return { ok: true, payload };
}

function isLikelySolanaAddress(value) {
  if (typeof value !== "string") return false;
  if (value.length < 32 || value.length > 44) return false;
  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(value);
}

/**
 * Issue an unsigned challenge for a wallet.
 *
 * Returns:
 *   {
 *     token,    // opaque, must be returned with the signature
 *     message,  // the exact UTF-8 string the wallet must sign
 *     expiresAt
 *   }
 */
export function issueLoginChallenge({ walletAddress }) {
  if (!isLikelySolanaAddress(walletAddress)) {
    throw new Error("Invalid walletAddress");
  }
  const issuedAt = Date.now();
  const expiresAt = issuedAt + NONCE_TTL_MS;
  const nonce = crypto.randomBytes(16).toString("hex");
  const message =
    `${DOMAIN} wants you to sign in with your Solana account.\n\n`
    + `Wallet: ${walletAddress}\n`
    + `Nonce: ${nonce}\n`
    + `Issued At: ${new Date(issuedAt).toISOString()}\n`
    + `Expires At: ${new Date(expiresAt).toISOString()}`;

  const token = signEnvelope({
    kind: "login",
    wallet: walletAddress,
    nonce,
    message,
    iat: issuedAt,
    exp: expiresAt,
  });

  return { token, message, expiresAt: new Date(expiresAt).toISOString() };
}

/**
 * Verify a signed login challenge and mint a session token.
 *
 * @param {object} args
 * @param {string} args.walletAddress  The wallet claiming to sign.
 * @param {string} args.message        The message that was signed (UTF-8).
 * @param {string} args.signature      Base58-encoded ed25519 signature.
 * @param {string} args.token          The token returned from `issueLoginChallenge`.
 */
export function verifyLoginAndIssueSession({
  walletAddress,
  message,
  signature,
  token,
}) {
  if (!isLikelySolanaAddress(walletAddress)) {
    return { ok: false, error: "Invalid walletAddress" };
  }
  if (!message || typeof message !== "string") {
    return { ok: false, error: "Missing message" };
  }
  if (!signature || typeof signature !== "string") {
    return { ok: false, error: "Missing signature" };
  }

  const opened = openEnvelope(token);
  if (!opened.ok) return { ok: false, error: opened.error };
  const payload = opened.payload;
  if (payload.kind !== "login") {
    return { ok: false, error: "Wrong token kind" };
  }
  if (payload.wallet !== walletAddress) {
    return { ok: false, error: "Token wallet mismatch" };
  }
  if (payload.message !== message) {
    return { ok: false, error: "Message does not match issued challenge" };
  }

  let pubkeyBytes;
  let sigBytes;
  try {
    pubkeyBytes = bs58.decode(walletAddress);
    sigBytes = bs58.decode(signature);
  } catch {
    return { ok: false, error: "Could not decode wallet/signature (expected base58)" };
  }
  if (pubkeyBytes.length !== 32) {
    return { ok: false, error: "Invalid wallet pubkey length" };
  }
  if (sigBytes.length !== 64) {
    return { ok: false, error: "Invalid signature length" };
  }

  const messageBytes = new TextEncoder().encode(message);
  const valid = nacl.sign.detached.verify(messageBytes, sigBytes, pubkeyBytes);
  if (!valid) return { ok: false, error: "Invalid signature for this wallet" };

  const issuedAt = Date.now();
  const expiresAt = issuedAt + SESSION_TTL_MS;
  const session = signEnvelope({
    kind: "session",
    wallet: walletAddress,
    iat: issuedAt,
    exp: expiresAt,
  });

  return {
    ok: true,
    session,
    walletAddress,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

/**
 * Express middleware. Requires a valid wallet session.
 * On success, sets `req.walletAddress`.
 */
export function requireWalletSession(req, res, next) {
  const auth = req.headers.authorization || req.headers.Authorization;
  let token = null;
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    token = auth.slice(7).trim();
  } else if (typeof req.headers["x-paywall-session"] === "string") {
    token = req.headers["x-paywall-session"].trim();
  }
  if (!token) return res.status(401).json({ error: "Missing session token" });

  const opened = openEnvelope(token);
  if (!opened.ok) return res.status(401).json({ error: opened.error });
  if (opened.payload.kind !== "session") {
    return res.status(401).json({ error: "Wrong token kind" });
  }
  req.walletAddress = opened.payload.wallet;
  next();
}
