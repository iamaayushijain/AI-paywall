/**
 * Cloudflare Workers adapter.
 *
 * Usage:
 *   import { createPaywall } from "tollgate-sdk";
 *   import { cloudflareHandler } from "tollgate-sdk/cloudflare";
 *
 *   export default {
 *     async fetch(request, env, ctx) {
 *       const paywall = createPaywall({ walletAddress: env.SOLANA_WALLET_ADDRESS });
 *       return cloudflareHandler(paywall, request, async () => {
 *         return new Response("Premium content");
 *       });
 *     },
 *   };
 *
 * If you want a one-liner that wraps an existing handler:
 *   export default { fetch: withPaywall(paywall, originalFetch) };
 */

export async function cloudflareHandler(paywall, request, originHandler) {
  const url = new URL(request.url);
  const verdict = await paywall.run({
    method: request.method,
    pathname: url.pathname,
    headers: request.headers,
  });

  if (verdict.kind === "passthrough") {
    return originHandler(request, verdict.payment);
  }

  return new Response(JSON.stringify(verdict.body), {
    status: verdict.status,
    headers: verdict.headers || { "Content-Type": "application/json" },
  });
}

export function withPaywall(paywall, originHandler) {
  return async function paywallFetch(request, env, ctx) {
    return cloudflareHandler(
      paywall,
      request,
      (req, payment) => originHandler(req, env, ctx, payment),
    );
  };
}
