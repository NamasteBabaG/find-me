import { paymentReadiness } from "../src/domain/payment-readiness";

// Deliberately no env-file, credentials, network, database or provider calls.
const args = process.argv.slice(2);
const target = args[1], provider = args[3];
if (args.length !== 4 || args[0] !== "--target" || args[2] !== "--provider"
  || !["development", "qa", "production"].includes(target ?? "") || !["mock", "payme"].includes(provider ?? "")) {
  console.error("Usage: npm run payments:preflight -- --target qa|production|development --provider mock|payme");
  process.exitCode = 2;
} else {
  const report = paymentReadiness({ appEnv: target as "development" | "qa" | "production", provider: provider as "mock" | "payme",
    purchasingEnabled: true, realGeneration: false });
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.readyForRequestedUse ? 0 : 2;
}
