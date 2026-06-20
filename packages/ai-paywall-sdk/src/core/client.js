/**
 * Thin HTTP client for the AI Paywall facilitator.
 *
 * The facilitator is fully stateless and unauthenticated for SDK calls — it
 * only ever needs the wallet address that should receive payments, plus the
 * network, to issue x402 challenges and verify on-chain USDC deliveries.
 *
 *   POST {apiUrl}/v1/challenge
 *   POST {apiUrl}/v1/verify
 */

const DEFAULT_API_URL = "https://ai-paywall-production-f453.up.railway.app";

export class PaywallClient {
  constructor({ walletAddress, network, usdcMint, apiUrl, fetchImpl, timeoutMs = 8000 }) {
    if (!walletAddress) throw new Error("PaywallClient requires walletAddress");
    this.walletAddress = walletAddress;
    this.network = network || "devnet";
    this.usdcMint = usdcMint || null;
    this.apiUrl = (apiUrl || DEFAULT_API_URL).replace(/\/$/, "");
    this.fetch = fetchImpl || globalThis.fetch;
    this.timeoutMs = timeoutMs;
    if (!this.fetch) {
      throw new Error("No fetch implementation available. Provide fetchImpl.");
    }
  }

  async #post(path, body) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.fetch(`${this.apiUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
        signal: ctrl.signal,
      });
      const text = await res.text();
      let json;
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 120)}`);
      }
      if (!res.ok) {
        const err = new Error(json.error || `HTTP ${res.status}`);
        err.status = res.status;
        err.body = json;
        throw err;
      }
      return json;
    } finally {
      clearTimeout(t);
    }
  }

  async createChallenge({ resource, basePriceMicroUsdc, bot, ensureTreasuryAta = true }) {
    return this.#post("/v1/challenge", {
      walletAddress: this.walletAddress,
      network: this.network,
      usdcMint: this.usdcMint,
      resource,
      basePriceMicroUsdc,
      bot,
      ensureTreasuryAta,
    });
  }

  async verify({ paymentHeader, resource, challengeToken, requiredMicroUsdc, meta }) {
    return this.#post("/v1/verify", {
      walletAddress: this.walletAddress,
      network: this.network,
      usdcMint: this.usdcMint,
      paymentHeader,
      resource,
      challengeToken,
      requiredMicroUsdc,
      meta,
    });
  }
}
