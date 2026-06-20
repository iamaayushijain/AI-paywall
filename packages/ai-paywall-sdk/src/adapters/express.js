/**
 * Express adapter.
 *
 * Usage:
 *   import express from "express";
 *   import { createPaywall } from "tollgate-sdk";
 *   import { expressMiddleware } from "tollgate-sdk/express";
 *
 *   const paywall = createPaywall({ walletAddress: process.env.SOLANA_WALLET_ADDRESS });
 *   const app = express();
 *
 *   // Protect all routes:
 *   app.use(expressMiddleware(paywall));
 *
 *   // Or protect just specific routes:
 *   app.use(expressMiddleware(paywall, { protect: ["/articles/*"] }));
 */

export function expressMiddleware(paywall, overrides = {}) {
  return async function paywallMiddleware(req, res, next) {
    try {
      const verdict = await paywall.run({
        method: req.method,
        pathname: req.originalUrl?.split("?")[0] || req.path,
        headers: req.headers,
      });

      if (verdict.kind === "passthrough") {
        if (verdict.payment) req.paywallPayment = verdict.payment;
        return next();
      }

      res.status(verdict.status);
      Object.entries(verdict.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
      res.json(verdict.body);
    } catch (err) {
      next(err);
    }
    // overrides currently reserved for future per-mount configuration.
    void overrides;
  };
}
