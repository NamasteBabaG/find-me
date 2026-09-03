import path from "node:path";
import { env } from "@/lib/env";
import { prisma, type Db } from "@/infra/db/prisma";
import type { StorageProvider } from "@/infra/storage/types";
import { LocalDiskStorage } from "@/infra/storage/local";
import type { PaymentProvider } from "@/infra/payment/types";
import { MockPaymentProvider } from "@/infra/payment/mock";
import { PayMeProvider } from "@/infra/payment/payme";
import type { AvatarProvider, FaceDetector } from "@/infra/generation/types";
import { MockAvatarProvider, NoopFaceDetector } from "@/infra/generation/mock";
import { OpenAiAvatarProvider } from "@/infra/generation/openai";
import type { EmailProvider } from "@/infra/email/types";
import { ConsoleEmailProvider } from "@/infra/email/console";
import { ResendEmailProvider } from "@/infra/email/resend";
import type { AnalyticsSink } from "@/infra/analytics/types";
import { ConsoleAnalytics, NoopAnalytics } from "@/infra/analytics/console";
import type { JobRunner } from "@/infra/jobs/types";
import { InProcessJobRunner } from "@/infra/jobs/in-process";
import { InlineJobRunner } from "@/infra/jobs/inline";
import { DbStorage } from "@/infra/storage/db";
import { runGenerationPipeline } from "./generation/pipeline";

/**
 * Composition root. Every provider is chosen here, by env, exactly once.
 * Services receive the container explicitly (no hidden globals) so they are
 * trivial to test with fakes.
 */
export interface Container {
  db: Db;
  storage: StorageProvider;
  payment: PaymentProvider;
  avatars: AvatarProvider;
  faces: FaceDetector;
  email: EmailProvider;
  analytics: AnalyticsSink;
  jobs: JobRunner;
  appUrl: string;
  secret: string;
}

function build(): Container {
  const e = env();
  const storageRoot = path.resolve(process.cwd(), e.STORAGE_LOCAL_DIR);

  // A provider that is named but not built must never fall back silently: that is
  // how a deploy ends up "configured for OpenAI" while quietly serving mocks.
  const notBuilt = (key: string, value: string, use: string) => {
    throw new Error(`${key}=${value} is not implemented yet — use ${use} (src/services/container.ts)`);
  };
  if (e.STORAGE_PROVIDER === "supabase") notBuilt("STORAGE_PROVIDER", e.STORAGE_PROVIDER, '"db" or "local"');
  if (e.GENERATION_PROVIDER === "replicate") notBuilt("GENERATION_PROVIDER", e.GENERATION_PROVIDER, '"openai" or "mock"');
  if (e.ANALYTICS_PROVIDER === "posthog") notBuilt("ANALYTICS_PROVIDER", e.ANALYTICS_PROVIDER, '"console" or "none"');
  const storage: StorageProvider = e.STORAGE_PROVIDER === "db" ? new DbStorage(prisma) : new LocalDiskStorage(storageRoot);

  const payment: PaymentProvider = e.PAYMENT_PROVIDER === "payme" ? new PayMeProvider(e.PAYME_SELLER_ID ?? "", e.PAYME_WEBHOOK_SECRET ?? "") : new MockPaymentProvider(e.APP_URL, e.SESSION_SECRET);

  const email: EmailProvider = e.EMAIL_PROVIDER === "resend" ? new ResendEmailProvider(e.RESEND_API_KEY ?? "", e.EMAIL_FROM) : new ConsoleEmailProvider(path.join(storageRoot, "outbox"));

  const analytics: AnalyticsSink = e.ANALYTICS_PROVIDER === "none" ? new NoopAnalytics() : new ConsoleAnalytics();

  const container: Container = {
    db: prisma,
    storage,
    payment,
    avatars:
      e.GENERATION_PROVIDER === "openai"
        ? new OpenAiAvatarProvider(e.OPENAI_API_KEY ?? "", { model: e.GENERATION_MODEL, quality: e.GENERATION_QUALITY, perMinute: e.GENERATION_RPM })
        : new MockAvatarProvider(),
    faces: new NoopFaceDetector(),
    email,
    analytics,
    jobs: e.JOBS_MODE === "inline" ? new InlineJobRunner() : new InProcessJobRunner(),
    appUrl: e.APP_URL,
    secret: e.SESSION_SECRET,
  };

  container.jobs.register("generate-game", ({ gameId }) => runGenerationPipeline(container, gameId));
  warnAboutMocks(e);
  return container;
}

const g = globalThis as unknown as { __findmeContainer?: Container };

export function getContainer(): Container {
  if (!g.__findmeContainer) g.__findmeContainer = build();
  return g.__findmeContainer;
}

/**
 * Production may run on mocks on purpose (the public demo does), but it must say
 * so out loud — "it looked configured" is not an acceptable way to lose a payment.
 */
function warnAboutMocks(e: ReturnType<typeof env>): void {
  if (e.NODE_ENV !== "production") return;
  const mocks: string[] = [];
  if (e.PAYMENT_PROVIDER === "mock") mocks.push("payments are simulated (no money moves)");
  if (e.EMAIL_PROVIDER === "console") mocks.push("email is written to disk, not sent");
  if (e.STORAGE_PROVIDER === "local") mocks.push("assets go to local disk, which a serverless host throws away");
  if (e.GENERATION_PROVIDER === "mock") mocks.push("child sprites come from the procedural mock, not a real generator");
  if (mocks.length === 0) return;
  console.warn(`[container] PRODUCTION IS RUNNING ON MOCKS: ${mocks.join("; ")}.`);
}
