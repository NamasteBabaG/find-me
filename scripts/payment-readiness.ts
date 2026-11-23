import { paymentReadiness } from "../src/domain/payment-readiness";

// Deliberately no env-file, credentials, network, database or provider calls.
const args = process.argv.slice(2);
const target = args[1], provider = args[3], environment = args[5];
const environmentValid = args.length === 4
  || (args.length === 6 && args[4] === "--payme-environment" && provider === "payme"
    && (environment === "sandbox" || environment === "live"));
if (!environmentValid || args[0] !== "--target" || args[2] !== "--provider"
  || !["development", "qa", "production"].includes(target ?? "") || !["mock", "payme"].includes(provider ?? "")) {
  console.error("Usage: npm run payments:preflight -- --target qa|production|development --provider mock|payme [--payme-environment sandbox|live]");
  process.exitCode = 2;
} else {
  const report = paymentReadiness({ appEnv: target as "development" | "qa" | "production", provider: provider as "mock" | "payme",
    paymeEnvironment: environment as "sandbox" | "live" | undefined, purchasingEnabled: true, realGeneration: false });
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.readyForRequestedUse ? 0 : 2;
}
