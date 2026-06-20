/**
 * Framework-agnostic paywall orchestrator.
 *
 * Adapters convert framework-specific request/response into the normalized
 * interface here, call `runPaywall(...)`, and translate the verdict back.
 *
 * Verdict shapes:
 *   { kind: "passthrough" }
 *   { kind: "passthrough", payment: { signature, payer, received } }
 *   { kind: "402", status: 402, body: <object>, headers: <object> }
 *   { kind: "403", status: 403, body: <object>, headers: <object> }
 *   { kind: "error", status: 500, body: <object>, headers: <object> }
 */

import { detectBot } from "./botDetector.js";

function getHeader(headers, name) {
  if (!headers) return undefined;
  if (typeof headers.get === "function") return headers.get(name);
  return headers[name] ?? headers[name.toLowerCase()];
}

function pathMatches(pathname, matchers) {
  if (!matchers || matchers.length === 0) return true;
  for (const m of matchers) {
    if (m instanceof RegExp) {
      if (m.test(pathname)) return true;
      continue;
    }
    if (typeof m === "string") {
      if (m === pathname) return true;
      if (m.endsWith("/*") && pathname.startsWith(m.slice(0, -2))) return true;
      if (m.endsWith("*") && pathname.startsWith(m.slice(0, -1))) return true;
    }
  }
  return false;
}

const HEADERS_JSON = { "Content-Type": "application/json" };

export async function runPaywall({
  client,
  config,
  request: { method = "GET", pathname, headers },
}) {
  const protect = config.protect || ["/*"];
  if (!pathMatches(pathname, protect)) {
    return { kind: "passthrough" };
  }

  const detection = detectBot(
    { headers, method },
    {
      botScoreThreshold: config.botScoreThreshold ?? 70,
      allowList: config.allowList,
    },
  );

  if (config.onDetection) {
    try { config.onDetection(detection); } catch { /* user hook errors swallowed */ }
  }

  if (!detection.isBot) {
    return { kind: "passthrough" };
  }

  const xPayment = getHeader(headers, "x-payment");
  const challengeToken = getHeader(headers, "x-paywall-challenge");

  if (!xPayment) {
    try {
      const envelope = await client.createChallenge({
        resource: pathname,
        basePriceMicroUsdc: config.basePriceMicroUsdc,
        bot: detection.botName,
      });
      return {
        kind: "402",
        status: 402,
        headers: HEADERS_JSON,
        body: envelope,
      };
    } catch (err) {
      return failOpen(config, err, "challenge_failed");
    }
  }

  try {
    const result = await client.verify({
      paymentHeader: xPayment,
      resource: pathname,
      challengeToken,
      requiredMicroUsdc: config.basePriceMicroUsdc,
      meta: {
        botName: detection.botName,
        userAgent: getHeader(headers, "user-agent"),
      },
    });

    if (result.verified) {
      return {
        kind: "passthrough",
        payment: {
          signature: result.signature,
          payer: result.payer,
          received: result.received,
        },
      };
    }
    return {
      kind: "403",
      status: 403,
      headers: HEADERS_JSON,
      body: { status: "forbidden", error: result.error || "Payment verification failed" },
    };
  } catch (err) {
    return failOpen(config, err, "verify_failed");
  }
}

function failOpen(config, err, stage) {
  const failOpen = config.failOpen ?? false;
  if (failOpen) {
    return {
      kind: "passthrough",
      degraded: { stage, message: err.message },
    };
  }
  return {
    kind: "error",
    status: 503,
    headers: HEADERS_JSON,
    body: { status: "error", stage, error: err.message || "Paywall unavailable" },
  };
}
