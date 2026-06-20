/**
 * Wallet-scoped data layer.
 *
 * Replaces the old `tenants.js` model. There is no tenant identity any more —
 * a "tenant" is just a Solana wallet address, derived directly from each
 * incoming SDK call. Analytics rows are keyed by `wallet_address`.
 *
 * Replay protection (`verified_tx_cache`) stays globally unique by tx
 * signature: a single Solana transaction can only ever credit one ATA, so
 * one wallet, so global uniqueness is sufficient.
 */

import db from "./db.js";

export async function recordWalletPayment({
  walletAddress,
  network,
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
  const { error } = await db.from("payments").insert({
    wallet_address: walletAddress,
    network: network || null,
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
    throw new Error(`Failed to record wallet payment: ${error.message}`);
  }
}

export async function getWalletPayments(walletAddress) {
  const { data, error } = await db
    .from("payments")
    .select("*")
    .eq("wallet_address", walletAddress)
    .order("timestamp", { ascending: false });

  if (error) throw new Error(`Failed to fetch wallet payments: ${error.message}`);
  return (data || []).map((row) => ({
    txSignature: row.tx,
    botName: row.bot_name,
    userAgent: row.user_agent,
    path: row.path,
    pageHash: row.page_hash,
    lamports: row.lamports,
    network: row.network,
    relevanceScore: row.relevance_score,
    timestamp: row.timestamp,
  }));
}

export async function getWalletTotalLamports(walletAddress) {
  const { data, error } = await db
    .from("payments")
    .select("lamports")
    .eq("wallet_address", walletAddress);
  if (error) throw new Error(`Failed to sum wallet payments: ${error.message}`);
  return (data || []).reduce((t, r) => t + Number(r.lamports || 0), 0);
}

export async function isTxCachedGlobal(tx) {
  const { data, error } = await db
    .from("verified_tx_cache")
    .select("tx")
    .eq("tx", tx)
    .maybeSingle();
  if (error) throw new Error(`Failed to read tx cache: ${error.message}`);
  return !!data;
}

export async function cacheTxGlobal({ walletAddress, tx }) {
  const { error } = await db.from("verified_tx_cache").insert({
    wallet_address: walletAddress || null,
    tx,
    cached_at: new Date().toISOString(),
  });
  if (error && error.code !== "23505") {
    throw new Error(`Failed to cache tx: ${error.message}`);
  }
}
