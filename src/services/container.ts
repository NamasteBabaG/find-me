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

  if (e.STORAGE_PROVIDER === "supabase") throw new Error("STORAGE_PROVIDER=supabase is not implemented yet — use \"db\" or \"local\"");
  const storage: StorageProvider = e.STORAGE_PROVIDER === "db" ? new DbStorage(prisma) : new LocalDiskStorage(storageRoot);

  const payment: PaymentProvider = e.PAYMENT_PROVIDER === "payme" ? new PayMeProvider(e.PAYME_SELLER_ID ?? "", e.PAYME_WEBHOOK_SECRET ?? "") : new MockPaymentProvider(e.APP_URL, e.SESSION_SECRET);

  const email: EmailProvider = e.EMAIL_PROVIDER === "resend" ? new ResendEmailProvider(e.RESEND_API_KEY ?? "", e.EMAIL_FROM) : new ConsoleEmailProvider(path.join(storageRoot, "outbox"));

  const analytics: AnalyticsSink = e.ANALYTICS_PROVIDER === "none" ? new NoopAnalytics() : new ConsoleAnalytics();

  const container: Container = {
    db: prisma,
    storage,
    payment,
    avatars: new MockAvatarProvider(),
    faces: new NoopFaceDetector(),
    email,
    analytics,
    jobs: e.JOBS_MODE === "inline" ? new InlineJobRunner() : new InProcessJobRunner(),
    appUrl: e.APP_URL,
    secret: e.SESSION_SECRET,
  };

  container.jobs.register("generate-game", ({ gameId }) => runGenerationPipeline(container, gameId));
  return container;
}

const g = globalThis as unknown as { __findmeContainer?: Container };

export function getContainer(): Container {
  if (!g.__findmeContainer) g.__findmeContainer = build();
  return g.__findmeContainer;
}
