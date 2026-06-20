/**
 * Tracks lifetime spend for an agent client and de-duplicates concurrent
 * payments for the same URL+nonce.
 *
 * Two concerns:
 *
 * 1. Budget enforcement
 *    The operator can set `maxTotalMicroUsdc` to cap how much the agent is
 *    ever allowed to spend in this process. Once exceeded, all further
 *    payments throw `PaymentBudgetExceededError`.
 *
 * 2. In-flight de-duplication
 *    If the same URL is fetched twice concurrently and both responses
 *    return 402 with the same challenge nonce, only one payment is sent.
 *    The second caller awaits the first.
 */

import { PaymentBudgetExceededError } from "./errors.js";

export function createSpendTracker({ maxTotalMicroUsdc } = {}) {
  let totalMicroUsdc = 0;
  let count = 0;
  let lastSignature = null;
  const inFlight = new Map();

  return {
    /** Throws if charging `amount` would exceed the lifetime budget. */
    assertBudget(amount) {
      if (
        maxTotalMicroUsdc !== undefined &&
        maxTotalMicroUsdc !== null &&
        totalMicroUsdc + amount > maxTotalMicroUsdc
      ) {
        throw new PaymentBudgetExceededError(
          `Payment of ${amount} micro-USDC would exceed lifetime budget of ${maxTotalMicroUsdc} (already spent ${totalMicroUsdc}).`,
          {
            attempted: amount,
            spent: totalMicroUsdc,
            limit: maxTotalMicroUsdc,
          },
        );
      }
    },

    record({ amountMicroUsdc, signature }) {
      totalMicroUsdc += amountMicroUsdc;
      count += 1;
      lastSignature = signature;
    },

    stats() {
      return {
        totalMicroUsdc,
        count,
        lastSignature,
        limit: maxTotalMicroUsdc ?? null,
        remaining:
          maxTotalMicroUsdc !== undefined && maxTotalMicroUsdc !== null
            ? Math.max(0, maxTotalMicroUsdc - totalMicroUsdc)
            : null,
      };
    },

    /**
     * Coalesce concurrent payments for the same key. The first caller runs
     * `fn()`; later callers receive the same promise.
     */
    coalesce(key, fn) {
      const existing = inFlight.get(key);
      if (existing) return existing;
      const promise = Promise.resolve()
        .then(fn)
        .finally(() => inFlight.delete(key));
      inFlight.set(key, promise);
      return promise;
    },
  };
}
