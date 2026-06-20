/**
 * Fastify plugin / hook adapter.
 *
 * Usage:
 *   import Fastify from "fastify";
 *   import { createPaywall } from "tollgate-sdk";
 *   import { fastifyPlugin } from "tollgate-sdk/fastify";
 *
 *   const paywall = createPaywall({ walletAddress: process.env.SOLANA_WALLET_ADDRESS });
 *   const app = Fastify();
 *
 *   await app.register(fastifyPlugin, {
 *     paywall,
 *     protect: ["/articles/*"],
 *   });
 */

export async function fastifyPlugin(fastify, opts = {}) {
  const paywall = opts.paywall;
  if (!paywall) throw new Error("fastifyPlugin requires { paywall }");

  fastify.addHook("preHandler", async (req, reply) => {
    const verdict = await paywall.run({
      method: req.method,
      pathname: req.url.split("?")[0],
      headers: req.headers,
    });

    if (verdict.kind === "passthrough") {
      if (verdict.payment) req.paywallPayment = verdict.payment;
      return;
    }
    reply.code(verdict.status);
    Object.entries(verdict.headers || {}).forEach(([k, v]) => reply.header(k, v));
    return reply.send(verdict.body);
  });
}

// Fastify auto-detection (default export form)
fastifyPlugin[Symbol.for("skip-override")] = true;
