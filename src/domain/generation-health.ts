/** Parent-facing preparation state; never expose provider errors or accounting details. */
export type PreparationState = "preparing" | "repairing" | "delayed" | "needsPhoto" | "attention" | "unavailable";
export const GENERATION_STALE_MS = 30 * 60_000;
export const GENERATION_RETRY_BACKOFF_MS = 5 * 60_000;

export function preparationState(input: {
  status: string;
  updatedAt: Date;
  job?: { status: string; currentStep: string | null; updatedAt: Date } | null;
  automaticRecovery?: boolean;
}, now = Date.now()): PreparationState {
  if (input.status === "NEEDS_NEW_PHOTO") return "needsPhoto";
  if (input.status === "MANUAL_REVIEW" || input.job?.currentStep === "local-patch:needs-release") return "attention";
  if (input.job?.currentStep === "local-patch:recovery-budget-wait" || input.job?.currentStep === "local-patch:evidence-retry-wait") return "delayed";
  if (input.status === "GENERATION_FAILED") return input.automaticRecovery ? "repairing" : "attention";
  if (input.job?.status === "FAILED") return input.automaticRecovery ? "repairing" : "attention";
  if (now - (input.job?.updatedAt ?? input.updatedAt).getTime() >= GENERATION_STALE_MS) return "delayed";
  if (input.status === "NEEDS_REGENERATION") return "repairing";
  return "preparing";
}
