/**
 * Typed errors thrown by tollgate-agent-sdk.
 *
 * Agent operators should generally catch `PaywallError` and inspect `code`
 * to decide whether to retry, surface to the user, or fail the task.
 */

export class PaywallError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "PaywallError";
    this.code = code;
    this.details = details || {};
  }
}

export class PaymentRefusedError extends PaywallError {
  constructor(message, details) {
    super("PAYMENT_REFUSED", message, details);
    this.name = "PaymentRefusedError";
  }
}

export class PaymentBudgetExceededError extends PaywallError {
  constructor(message, details) {
    super("BUDGET_EXCEEDED", message, details);
    this.name = "PaymentBudgetExceededError";
  }
}

export class UnsupportedChallengeError extends PaywallError {
  constructor(message, details) {
    super("UNSUPPORTED_CHALLENGE", message, details);
    this.name = "UnsupportedChallengeError";
  }
}

export class OnChainError extends PaywallError {
  constructor(message, details) {
    super("ON_CHAIN_ERROR", message, details);
    this.name = "OnChainError";
  }
}

export class VerificationRejectedError extends PaywallError {
  constructor(message, details) {
    super("VERIFICATION_REJECTED", message, details);
    this.name = "VerificationRejectedError";
  }
}
