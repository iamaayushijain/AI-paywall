import crypto from 'crypto';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const secret = process.env.PAYWALL_CHALLENGE_SECRET || 'dev-secret-change-me';

function base64urlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function base64urlDecode(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function hmac(payloadB64) {
  return crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

function safeEqual(a, b) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

/**
 * Issue a challenge token bound to (resource, wallet, network, mint, price).
 *
 * The binding prevents an attacker from reusing a challenge issued for
 * wallet A on a request that pays wallet B, or replaying a low-price
 * challenge against a high-price resource.
 *
 * Backward-compatible: callers may pass a plain `resource` string and get
 * a challenge bound only to the resource (legacy single-tenant flow).
 */
export function createPaymentChallenge(resourceOrBinding) {
  const binding = typeof resourceOrBinding === 'string'
    ? { resource: resourceOrBinding }
    : (resourceOrBinding || {});

  if (!binding.resource) {
    throw new Error('createPaymentChallenge requires a resource');
  }

  const expiresAtMs = Date.now() + CHALLENGE_TTL_MS;
  const payload = {
    v: 2,
    resource: binding.resource,
    wallet: binding.walletAddress || null,
    network: binding.network || null,
    mint: binding.usdcMint || null,
    price: binding.requiredMicroUsdc != null
      ? Number(binding.requiredMicroUsdc)
      : null,
    nonce: crypto.randomBytes(16).toString('hex'),
    expiresAtMs,
  };
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const signature = hmac(payloadB64);
  const token = `${payloadB64}.${signature}`;

  return {
    token,
    nonce: payload.nonce,
    resource: payload.resource,
    walletAddress: payload.wallet,
    network: payload.network,
    usdcMint: payload.mint,
    requiredMicroUsdc: payload.price,
    expiresAtMs: payload.expiresAtMs,
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
}

/**
 * Verify a challenge token. The expected binding is partially supplied by
 * the caller (resource is always required); other fields are checked only
 * if both the token and the caller declare them.
 *
 * @param {string|null|undefined} token
 * @param {string|object} expected  expected binding. If a string, treated as resource.
 */
export function verifyPaymentChallenge(token, expected) {
  if (!token) {
    return { ok: false, error: 'Missing challenge token' };
  }

  const expectedBinding = typeof expected === 'string'
    ? { resource: expected }
    : (expected || {});

  if (!expectedBinding.resource) {
    return { ok: false, error: 'Expected resource missing' };
  }

  const [payloadB64, signature] = token.split('.');
  if (!payloadB64 || !signature) {
    return { ok: false, error: 'Malformed challenge token' };
  }

  const expectedSig = hmac(payloadB64);
  if (!safeEqual(signature, expectedSig)) {
    return { ok: false, error: 'Invalid challenge signature' };
  }

  let payload;
  try {
    payload = JSON.parse(base64urlDecode(payloadB64));
  } catch {
    return { ok: false, error: 'Invalid challenge payload' };
  }

  if (payload.resource !== expectedBinding.resource) {
    return { ok: false, error: 'Challenge resource mismatch' };
  }
  if (typeof payload.expiresAtMs !== 'number' || Date.now() > payload.expiresAtMs) {
    return { ok: false, error: 'Challenge expired' };
  }

  if (payload.wallet && expectedBinding.walletAddress
      && payload.wallet !== expectedBinding.walletAddress) {
    return { ok: false, error: 'Challenge wallet mismatch' };
  }
  if (payload.network && expectedBinding.network
      && payload.network !== expectedBinding.network) {
    return { ok: false, error: 'Challenge network mismatch' };
  }
  if (payload.mint && expectedBinding.usdcMint
      && payload.mint !== expectedBinding.usdcMint) {
    return { ok: false, error: 'Challenge mint mismatch' };
  }
  if (payload.price != null
      && expectedBinding.requiredMicroUsdc != null
      && Number(payload.price) > Number(expectedBinding.requiredMicroUsdc)) {
    return { ok: false, error: 'Challenge price mismatch' };
  }

  return {
    ok: true,
    nonce: payload.nonce,
    binding: {
      resource: payload.resource,
      walletAddress: payload.wallet || null,
      network: payload.network || null,
      usdcMint: payload.mint || null,
      requiredMicroUsdc: payload.price ?? null,
    },
  };
}
