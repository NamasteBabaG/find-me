import { describe, expect, it } from "vitest";
import { assertPaymentActivationQualified, paymentReadiness } from "../payment-readiness";

describe("payment source readiness", () => {
  it.each(["development", "qa"] as const)("permits a clearly identified %s simulation without certifying real money", appEnv => {
    const result = paymentReadiness({ appEnv, provider: "mock", purchasingEnabled: true, realGeneration: false });
    expect(result).toMatchObject({ mode: "simulation", readyForRequestedUse: true, realPaymentsQualified: false, merchantOrRuntimeVerified: false });
  });
  it("refuses the unimplemented PayMe adapter even for an active QA purchase", () => {
    expect(() => assertPaymentActivationQualified({ appEnv: "qa", provider: "payme", purchasingEnabled: true, realGeneration: false })).toThrow(/not qualified/);
  });
  it("does not certify a closed foundation as a real-payment launch", () => {
    expect(paymentReadiness({ appEnv: "production", provider: "payme", purchasingEnabled: false, realGeneration: false }))
      .toMatchObject({ mode: "closed", readyForRequestedUse: true, realPaymentsQualified: false });
  });
  it("refuses simulated payments on an active production shop", () => {
    expect(() => assertPaymentActivationQualified({ appEnv: "production", provider: "mock", purchasingEnabled: true, realGeneration: false })).toThrow(/mock-payments-in-production/);
  });
});
