/**
 * Local bot detection — runs entirely in the SDK with zero network calls.
 *
 * Returns a structured detection object so adapters can decide what to do.
 * Designed to keep false positives low: high-confidence AI/scraper UAs trip
 * the bot path; ambiguous browsers do not.
 */

const BOT_UA_PATTERNS = [
  // ── AI / LLM crawlers ────────────────────────────────────────────────────
  { pattern: /GPTBot/i,             name: "GPTBot",        score: 90 },
  { pattern: /ClaudeBot/i,          name: "ClaudeBot",     score: 90 },
  { pattern: /PerplexityBot/i,      name: "PerplexityBot", score: 90 },
  { pattern: /ChatGPT-User/i,       name: "ChatGPT",       score: 90 },
  { pattern: /OAI-SearchBot/i,      name: "OAI-SearchBot", score: 90 },
  { pattern: /Anthropic/i,          name: "Anthropic",     score: 85 },
  { pattern: /CCBot/i,              name: "CCBot",         score: 85 },
  { pattern: /YouBot/i,             name: "YouBot",        score: 85 },
  { pattern: /Bytespider/i,         name: "Bytespider",    score: 85 },
  { pattern: /Applebot/i,           name: "Applebot",      score: 80 },
  { pattern: /cohere-ai/i,          name: "CohereBot",     score: 85 },
  { pattern: /meta-externalagent/i, name: "MetaAI",        score: 85 },
  { pattern: /Diffbot/i,            name: "Diffbot",       score: 80 },
  { pattern: /Omgilibot/i,          name: "Omgili",        score: 80 },
  { pattern: /DataForSeoBot/i,      name: "DataForSeo",    score: 75 },

  // ── Classic search crawlers ──────────────────────────────────────────────
  { pattern: /Googlebot/i,          name: "Googlebot",     score: 70 },
  { pattern: /bingbot/i,            name: "Bingbot",       score: 70 },
  { pattern: /Slurp/i,              name: "Yahoo",         score: 70 },
  { pattern: /DuckDuckBot/i,        name: "DuckDuckBot",   score: 70 },
  { pattern: /Baiduspider/i,        name: "Baidu",         score: 70 },

  // ── Headless / automation ────────────────────────────────────────────────
  { pattern: /HeadlessChrome/i,     name: "Headless",      score: 75 },
  { pattern: /PhantomJS/i,          name: "PhantomJS",     score: 80 },
  { pattern: /Selenium/i,           name: "Selenium",      score: 80 },
  { pattern: /Playwright/i,         name: "Playwright",    score: 80 },
  { pattern: /Puppeteer/i,          name: "Puppeteer",     score: 80 },

  // ── Generic scraper signals ──────────────────────────────────────────────
  { pattern: /python-requests/i,    name: "PythonRequests", score: 70 },
  { pattern: /axios/i,              name: "Axios",         score: 55 },
  { pattern: /curl/i,               name: "curl",          score: 55 },
  { pattern: /wget/i,               name: "wget",          score: 65 },
  { pattern: /go-http-client/i,     name: "GoHTTP",        score: 60 },
  { pattern: /java\//i,             name: "JavaHTTP",      score: 55 },
  { pattern: /libwww-perl/i,        name: "Perl",          score: 65 },
  { pattern: /scrapy/i,             name: "Scrapy",        score: 85 },
];

const BROWSER_HEADERS = [
  "accept-language",
  "accept-encoding",
  "sec-fetch-site",
  "sec-ch-ua",
];

function getHeader(headers, name) {
  if (!headers) return undefined;
  if (typeof headers.get === "function") return headers.get(name);
  return headers[name] ?? headers[name.toLowerCase()];
}

function headerScore(headers) {
  let score = 0;
  const missing = BROWSER_HEADERS.filter((h) => !getHeader(headers, h));
  score += missing.length * 12;

  const accept = getHeader(headers, "accept");
  if (!accept) score += 20;
  if (accept === "*/*") score += 15;

  if (!getHeader(headers, "connection")) score += 10;
  return score;
}

/**
 * @param {object} input
 * @param {object|Headers} input.headers   request headers
 * @param {string} [input.method="GET"]    request method
 * @param {object} [opts]
 * @param {number} [opts.botScoreThreshold=70]
 * @param {Array<{pattern: RegExp, name: string, score?: number}>} [opts.allowList]
 *   matched UAs always pass as humans (e.g. for verified Googlebot allowlists)
 */
export function detectBot(input, opts = {}) {
  const { headers, method = "GET" } = input;
  const ua = getHeader(headers, "user-agent") || "";
  const threshold = opts.botScoreThreshold ?? 70;
  const allowList = opts.allowList || [];

  if (allowList.some((entry) => entry.pattern.test(ua))) {
    return {
      isBot: false,
      isSuspicious: false,
      score: 0,
      botName: null,
      signals: ["allowlist:matched"],
    };
  }

  const signals = [];
  let totalScore = 0;
  let detectedName = null;

  const uaMatch = BOT_UA_PATTERNS.find(({ pattern }) => pattern.test(ua));
  if (uaMatch) {
    totalScore += uaMatch.score;
    detectedName = uaMatch.name;
    signals.push(`ua:${uaMatch.name}(${uaMatch.score})`);
  }

  if (!ua) {
    totalScore += 60;
    signals.push("ua:missing(60)");
  }

  const hScore = headerScore(headers);
  if (hScore > 0) {
    totalScore += hScore;
    signals.push(`headers:suspicious(${hScore})`);
  }

  const acceptHtml = (getHeader(headers, "accept") || "").includes("text/html");
  if (!acceptHtml && method === "GET") {
    totalScore += 15;
    signals.push("accept:no-html(15)");
  }

  return {
    isBot: totalScore >= threshold,
    isSuspicious: totalScore >= 40 && totalScore < threshold,
    score: totalScore,
    botName: detectedName,
    signals,
  };
}
