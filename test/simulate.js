/**
 * Test helper to simulate AI agent requests against the paywall.
 * Usage: node test/simulate.js
 * Make sure the server is running first (npm start).
 */

const BASE = process.env.BASE_URL || "http://localhost:3000";

async function request(label, url, headers = {}) {
  console.log(`\n━━━ ${label} ━━━`);
  try {
    const res = await fetch(url, { headers });
    const body = await res.json();
    console.log(`Status: ${res.status}`);
    console.log(JSON.stringify(body, null, 2));
    return { status: res.status, body };
  } catch (err) {
    console.error("Request failed:", err.message);
    return null;
  }
}

async function run() {
  console.log("🧪 AI Paywall — Test Suite\n");

  // 1. Normal human request → should get content
  await request("1. Human visitor (expect 200)", `${BASE}/page`);

  // 2. AI request without payment → should get 402
  await request("2. GPTBot without payment (expect 402)", `${BASE}/page`, {
    "User-Agent": "Mozilla/5.0 (compatible; GPTBot/1.0)",
  });

  // 3. AI request with fake tx → should get 403
  await request("3. ClaudeBot with fake tx (expect 403)", `${BASE}/page`, {
    "User-Agent": "Mozilla/5.0 (compatible; ClaudeBot/1.0)",
    "x-payment-tx": "FakeTxSignature1234567890abcdef",
  });

  // 4. Check policy endpoint
  await request("4. AI Policy (expect 200)", `${BASE}/.well-known/ai-policy.json`);

  // 5. Check dashboard
  await request("5. Dashboard (expect 200)", `${BASE}/dashboard`);

  // 6. Health check
  await request("6. Health check (expect 200)", `${BASE}/health`);

  console.log("\n✅ All tests complete.\n");
}

run();
