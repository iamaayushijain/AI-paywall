import db from "./db.js";

export async function recordPayment({
  tx,
  botName,
  userAgent,
  path,
  pageHash,
  lamports,
  relevanceScore,
  contentType,
  botMultiplier,
  exclusivityMod,
}) {
  const { error } = await db
    .from("payments")
    .insert({
      tx,
      bot_name: botName || null,
      user_agent: userAgent || null,
      path: path || null,
      page_hash: pageHash || null,
      lamports: lamports || null,
      relevance_score: relevanceScore || null,
      content_type: contentType || null,
      bot_multiplier: botMultiplier || null,
      exclusivity_mod: exclusivityMod || null,
      timestamp: new Date().toISOString(),
    });

  if (error && error.code !== "23505") {
    throw new Error(`Failed to record payment: ${error.message}`);
  }
}

export async function getAllPayments() {
  const { data, error } = await db
    .from("payments")
    .select("*")
    .order("timestamp", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch payments: ${error.message}`);
  }

  return (data || []).map((row) => ({
    txSignature: row.tx,
    botName: row.bot_name,
    userAgent: row.user_agent,
    path: row.path,
    pageHash: row.page_hash,
    lamports: row.lamports,
    relevanceScore: row.relevance_score,
    timestamp: row.timestamp,
  }));
}

export async function getTotalLamports() {
  const { data, error } = await db
    .from("payments")
    .select("lamports");

  if (error) {
    throw new Error(`Failed to sum payments: ${error.message}`);
  }

  return (data || []).reduce((total, row) => total + Number(row.lamports || 0), 0);
}

export async function isTxCached(tx) {
  const { data, error } = await db
    .from("verified_tx_cache")
    .select("tx")
    .eq("tx", tx)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read tx cache: ${error.message}`);
  }

  return !!data;
}

export async function cacheTx(tx) {
  const { error } = await db
    .from("verified_tx_cache")
    .insert({
      tx,
      cached_at: new Date().toISOString(),
    });

  if (error && error.code !== "23505") {
    throw new Error(`Failed to cache tx: ${error.message}`);
  }
}
