import { z } from "zod";
import { SINGLE_VISUAL_REVIEW_VERSION } from "./single-visual-review";

/** Prospective only: an existing Explorer keeps its original review receipts. */
export const EXPLORERS_OPERATIONAL_RELEASE = "explorers-operational/v1" as const;
export type ExplorersOperationalRelease = typeof EXPLORERS_OPERATIONAL_RELEASE;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const explorersOperationalReceiptSchema = z.object({
  version: z.literal(EXPLORERS_OPERATIONAL_RELEASE),
  gameId: z.string().min(1).max(200).regex(/^[A-Za-z0-9_:-]+$/), worldId: z.string(),
  sourceFamilySha256: digest, sourcePlacementManifestSha256: digest,
  reviewMode: z.literal(SINGLE_VISUAL_REVIEW_VERSION), model: z.literal("gpt-6.1-sol"), effort: z.literal("low"),
  initialTier: z.literal("flex"), oneUsableAssessmentPerImage: z.literal(true),
  normalImageAttemptLimit: z.literal(3), worldCapMicroUsd: z.literal(4000000),
  automaticBudgetExtension: z.literal(false), authorizationSha256: digest,
}).strict();
export type ExplorersOperationalReceipt = z.infer<typeof explorersOperationalReceiptSchema>;
