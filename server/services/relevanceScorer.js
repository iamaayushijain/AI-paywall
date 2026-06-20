const BOT_PURPOSE = {
  GPTBot:          { type: "general_llm",   affinity: 8 },
  ClaudeBot:       { type: "general_llm",   affinity: 8 },
  PerplexityBot:   { type: "search_answer", affinity: 7 },
  GoogleBot:       { type: "search_index",  affinity: 4 },
  CodeInterpreter: { type: "code",          affinity: 9 },
  CCBot:           { type: "training_data", affinity: 10 },
  unknown:         { type: "unknown",       affinity: 5 },
};

// ─── 1. BOT REGISTRY ─────────────────────────────────────────────────────────
// Each bot now declares its commercial value tier and which content types
// it finds most valuable — used for the affinity matrix below.

const BOT_REGISTRY = {
  CCBot:           { tier: "training",   label: "Common Crawl",    baseMultiplier: 2.8 },
  GPTBot:          { tier: "llm",        label: "OpenAI",          baseMultiplier: 2.5 },
  ClaudeBot:       { tier: "llm",        label: "Anthropic",       baseMultiplier: 2.5 },
  OAI_SearchBot:   { tier: "llm",        label: "OpenAI Search",   baseMultiplier: 2.3 },
  PerplexityBot:   { tier: "answer",     label: "Perplexity",      baseMultiplier: 2.0 },
  YouBot:          { tier: "answer",     label: "You.com",         baseMultiplier: 1.8 },
  CohereBot:       { tier: "training",   label: "Cohere",          baseMultiplier: 2.6 },
  MetaAI:          { tier: "training",   label: "Meta",            baseMultiplier: 2.7 },
  Diffbot:         { tier: "extraction", label: "Diffbot",         baseMultiplier: 1.9 },
  Googlebot:       { tier: "search",     label: "Google",          baseMultiplier: 1.0 }, // SEO value — don't over-charge
  Bingbot:         { tier: "search",     label: "Bing",            baseMultiplier: 1.0 },
  Bytespider:      { tier: "training",   label: "ByteDance",       baseMultiplier: 2.4 },
  unknown:         { tier: "unknown",    label: "Unknown",         baseMultiplier: 1.5 },
};

// ─── 2. CONTENT × BOT AFFINITY MATRIX ────────────────────────────────────────
// A 2D lookup: how much does bot tier X value content type Y?
// Scale 0–1; replaces the flat affinity + path bonus approach.

const AFFINITY_MATRIX = {
//                 prose  technical  dataset  code  legal  news
  training:      { prose: 1.0, technical: 0.9, dataset: 1.0, code: 0.8, legal: 0.7, news: 0.9 },
  llm:           { prose: 0.9, technical: 1.0, dataset: 0.8, code: 1.0, legal: 0.6, news: 0.8 },
  answer:        { prose: 0.8, technical: 0.7, dataset: 0.6, code: 0.6, legal: 0.5, news: 1.0 },
  extraction:    { prose: 0.6, technical: 0.5, dataset: 1.0, code: 0.4, legal: 0.8, news: 0.6 },
  search:        { prose: 0.5, technical: 0.5, dataset: 0.4, code: 0.5, legal: 0.4, news: 0.7 },
  unknown:       { prose: 0.5, technical: 0.5, dataset: 0.5, code: 0.5, legal: 0.5, news: 0.5 },
};

// ─── 3. CONTENT CLASSIFIER ───────────────────────────────────────────────────
// Detects content type from path + body signals. More robust than path-only.

const PATH_CONTENT_TYPE_RULES = [
  { pattern: /^\/(blog|articles|posts)(\/|$)/i,    type: "prose"     },
  { pattern: /^\/(news|press)(\/|$)/i,             type: "news"      },
  { pattern: /^\/(docs|api|reference)(\/|$)/i,     type: "technical" },
  { pattern: /^\/(data|research|datasets)(\/|$)/i, type: "dataset"   },
  { pattern: /^\/(legal|terms|privacy)(\/|$)/i,    type: "legal"     },
  { pattern: /^\/(code|github|snippets)(\/|$)/i,   type: "code"      },
];

const BODY_CONTENT_SIGNALS = {
  code:      { pattern: /```[\s\S]*?```|<code[\s\S]*?<\/code>/g,       weight: 1.4 },
  table:     { pattern: /<table[\s\S]*?<\/table>|(\|.+\|.+\n){3,}/g,  weight: 1.3 },
  list:      { pattern: /(<[uo]l[\s\S]*?<\/[uo]l>)/g,                 weight: 1.1 },
  heading:   { pattern: /<h[1-3][^>]*>|^#{1,3} /gm,                   weight: 1.1 },
  equation:  { pattern: /\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]/g,         weight: 1.5 },
  citation:  { pattern: /\[\d+\]|\(\w+,\s*\d{4}\)/g,                  weight: 1.3 },
  datapoint: { pattern: /\b\d{1,3}(,\d{3})*(\.\d+)?\s*(%|USD|\$|€)/g, weight: 1.2 },
};

function classifyContentType(path, body = "") {
  // Path takes precedence
  for (const { pattern, type } of PATH_CONTENT_TYPE_RULES) {
    if (pattern.test(path)) return type;
  }
  // Fall back to body signal counting
  const counts = Object.entries(BODY_CONTENT_SIGNALS).map(([key, { pattern }]) => ({
    key,
    count: (body.match(pattern) ?? []).length,
  }));
  const dominant = counts.sort((a, b) => b.count - a.count)[0];
  if (dominant?.count > 2) {
    if (dominant.key === "code") return "code";
    if (dominant.key === "table" || dominant.key === "datapoint") return "dataset";
    if (dominant.key === "equation" || dominant.key === "citation") return "technical";
  }
  return "prose";
}




function stripHTML(text) {
  return text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function getWordCount(text) {
  return text ? stripHTML(text).split(/\s+/).filter(Boolean).length : 0;
}


function scoreContentRichness(body = "") {
  const wordCount = getWordCount(body);
  if (wordCount < 50) return 0.05; // Near-empty page

  // Log scale: 500w → ~0.45, 1500w → ~0.65, 3000w → ~0.78, 8000w → ~0.95
  const lengthScore = Math.min(Math.log10(wordCount / 50) / Math.log10(160), 1);

  // Structural richness bonus
  let structureBonus = 0;
  for (const { pattern, weight } of Object.values(BODY_CONTENT_SIGNALS)) {
    const matches = (body.match(pattern) ?? []).length;
    if (matches > 0) structureBonus += Math.min(matches / 10, 1) * (weight - 1) * 0.1;
  }
  structureBonus = Math.min(structureBonus, 0.3);

  // Originality proxy: ratio of unique words to total (low ratio = boilerplate/repetitive)
  const words = stripHTML(body).toLowerCase().split(/\s+/);
  const uniqueRatio = words.length > 0 ? new Set(words).size / words.length : 0;
  const originalityBonus = (uniqueRatio - 0.3) * 0.2; // baseline ~0.3 for typical prose

  return Math.min(Math.max(lengthScore + structureBonus + originalityBonus, 0.05), 1.0);
}


function scoreFreshness(publishedAt) {
  if (!publishedAt) return 0.7; // unknown → neutral
  const ageMs = Date.now() - new Date(publishedAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays < 7)   return 1.0;
  if (ageDays < 30)  return 0.9;
  if (ageDays < 180) return 0.75;
  if (ageDays < 730) return 0.6;
  return 0.45; // > 2 years
}

// ─── 6. EXCLUSIVITY MODIFIER ─────────────────────────────────────────────────
// Normally-paywalled or proprietary content commands a premium.

const EXCLUSIVITY_MODIFIERS = {
  public:      1.0,
  metered:     1.4,  // e.g. 3 free articles then paywall
  subscriber:  1.8,  // normally behind a login
  proprietary: 2.5,  // licensed/unique datasets, research
};



function scoreDemand(monthlyPageViews) {
  if (!monthlyPageViews) return 1.0;
  if (monthlyPageViews > 1_000_000) return 1.5;
  if (monthlyPageViews > 100_000)  return 1.3;
  if (monthlyPageViews > 10_000)   return 1.15;
  if (monthlyPageViews > 1_000)    return 1.05;
  return 0.9; // low-traffic page → slight discount
}

// ─── 8. COMPOSITE SCORER ─────────────────────────────────────────────────────

/**
 * @param {Object} params
 * @param {string} params.botName        - Detected bot name (key in BOT_REGISTRY)
 * @param {string} params.path           - Request path
 * @param {string} [params.body]         - Raw page body (HTML or text)
 * @param {string} [params.publishedAt]  - ISO date string of publication
 * @param {string} [params.exclusivity]  - 'public' | 'metered' | 'subscriber' | 'proprietary'
 * @param {number} [params.monthlyViews] - Monthly page views from analytics
 */
export function scorePageValue(params) {
  const {
    botName,
    path,
    body = "",
    publishedAt = null,
    exclusivity = "public",
    monthlyViews = null,
  } = params;

  const bot         = BOT_REGISTRY[botName] ?? BOT_REGISTRY.unknown;
  const contentType = classifyContentType(path, body);
  const affinityRow = AFFINITY_MATRIX[bot.tier] ?? AFFINITY_MATRIX.unknown;
  const affinity    = affinityRow[contentType] ?? 0.5;

  const richness    = scoreContentRichness(body);
  const freshness   = scoreFreshness(publishedAt);
  const exclusMod   = EXCLUSIVITY_MODIFIERS[exclusivity] ?? 1.0;
  const demandMod   = scoreDemand(monthlyViews);

  // Weighted composite: affinity and richness are most important
  const baseScore =
    affinity  * 0.35 +
    richness  * 0.35 +
    freshness * 0.20 +
    0.10; // floor contribution

  const finalScore = Math.min(Math.max(baseScore, 0), 1);

  return {
    score: finalScore,
    contentType,
    breakdown: {
      affinity:    +(affinity  * 0.35).toFixed(3),
      richness:    +(richness  * 0.35).toFixed(3),
      freshness:   +(freshness * 0.20).toFixed(3),
    },
    modifiers: {
      botMultiplier:  bot.baseMultiplier,
      exclusivityMod: exclusMod,
      demandMod,
    },
  };
}

// ─── 9. PRICING ENGINE ───────────────────────────────────────────────────────

/**
 * @param {Object}  scoringParams     - Same shape as scorePageValue params
 * @param {number}  baseLamports      - Your floor price per crawl
 * @param {number}  [maxMultiplier]   - Hard ceiling multiplier (default 20×)
 * @returns {{ price: number, score: number, breakdown: object }}
 */
export function getPriceForRequest(scoringParams, baseLamports, maxMultiplier = 20) {
  const valuation = scorePageValue(scoringParams);
  const { score, modifiers } = valuation;

  // score is 0–1; scale to a 1–10 price multiplier, then apply modifiers
  const scoreMultiplier  = 1 + score * 9;                // 1× – 10×
  const compositeMultiplier =
    scoreMultiplier *
    modifiers.botMultiplier *
    modifiers.exclusivityMod *
    modifiers.demandMod;

  const clampedMultiplier = Math.min(compositeMultiplier, maxMultiplier);
  const price = Math.floor(baseLamports * clampedMultiplier);

  return {
    price,
    multiplier: +clampedMultiplier.toFixed(2),
    score: +score.toFixed(3),
    breakdown: {
      ...valuation.breakdown,
      contentType: valuation.contentType,
      ...modifiers,
    },
  };
}



function getDensityScore(wordCount) {
  if (wordCount < 100) return 2;
  if (wordCount <= 500) return 4;
  if (wordCount <= 1500) return 6;
  if (wordCount <= 3000) return 8;
  return 10;
}

function getPathType(reqPath) {
  if (reqPath === "/") return "index";
  if (/^\/(blog|articles)(\/|$)/i.test(reqPath)) return "editorial";
  if (/^\/(docs|api)(\/|$)/i.test(reqPath)) return "technical";
  if (/^\/(data|research)(\/|$)/i.test(reqPath)) return "dataset";
  return "general";
}

function getPathBonus(botType, reqPath) {
  if (botType === "training_data") return 3;
  if (botType === "search_answer") return 1;
  if (botType === "general_llm" && /^\/(blog|articles)(\/|$)/i.test(reqPath)) return 2;
  if (botType === "code" && /^\/(docs|api)(\/|$)/i.test(reqPath)) return 2;
  return 0;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function scoreRelevance(botName, path, contentBody) {
  const bot = BOT_PURPOSE[botName] || BOT_PURPOSE.unknown;
  const wordCount = getWordCount(contentBody);
  const density = getDensityScore(wordCount);
  const bonus = getPathBonus(bot.type, path);
  const raw = (bot.affinity * 0.4) + (density * 0.35) + (bonus * 0.25);
  return Math.round(clamp(raw, 1, 10));
}

export function getContentSignals(botName, path, contentBody) {
  const bot = BOT_PURPOSE[botName] || BOT_PURPOSE.unknown;
  return {
    bot_tier: bot.affinity,
    path_type: getPathType(path),
    estimated_word_count: contentBody ? getWordCount(contentBody) : null,
  };
}


