/** Source qualification only. Credentials and redirect success are not payment proof. */
export const PAYMENT_READINESS_VERSION = "payment-source-readiness/v1" as const;
export const PAYME_QUALIFICATION_GAPS = Object.freeze([
  "checkout-and-verified-webhook-unimplemented", "refund-adapter-unimplemented", "provider-idempotency-and-terminal-close-unverified",
  "duplicate-refund-entitlement-unqualified", "durable-refund-claim-unqualified", "late-paid-reconciliation-unqualified",
  "historical-checkout-reconciliation-unqualified", "postgres-concurrency-unverified", "merchant-sandbox-unverified",
] as const);
export type PaymentReadinessInput = Readonly<{
  appEnv: "development" | "qa" | "production";
  provider: "mock" | "payme";
  purchasingEnabled: boolean;
  realGeneration: boolean;
}>;

export function paymentReadiness(input: PaymentReadinessInput) {
  const active = input.purchasingEnabled || input.realGeneration;
  const simulated = input.provider === "mock" && input.appEnv !== "production";
  const mode = !active ? "closed" : simulated ? "simulation" : "blocked";
  const blockers = mode !== "blocked" ? [] : input.provider === "mock"
    ? ["mock-payments-in-production"] : [...PAYME_QUALIFICATION_GAPS];
  return {
    version: PAYMENT_READINESS_VERSION, environment: input.appEnv, provider: input.provider, mode,
    readyForRequestedUse: mode !== "blocked", realPaymentsQualified: false,
    sourceContractOnly: true, merchantOrRuntimeVerified: false, blockers,
    qualificationGaps: input.provider === "payme" ? [...PAYME_QUALIFICATION_GAPS] : ["real-payment-provider-required"],
  } as const;
}

export function assertPaymentActivationQualified(input: PaymentReadinessInput): void {
  const result = paymentReadiness(input);
  if (!result.readyForRequestedUse) {
    throw new Error("Payment provider is not qualified for activation: " + result.blockers.join(", ") + ". Keep the shop closed until the real-payment contract is implemented and verified.");
  }
}
