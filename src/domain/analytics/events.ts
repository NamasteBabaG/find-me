/**
 * Product analytics vocabulary. Names are the contract with dashboards.
 * NEVER attach a child's name, email, photo or free text to an event.
 */
export const ANALYTICS_EVENTS = [
  "landing_demo_started",
  "landing_demo_target_found",
  "create_started",
  "photo_uploaded",
  "photo_rejected",
  "photo_approved",
  "package_selected",
  "scenes_selected",
  "checkout_started",
  "payment_completed",
  "generation_started",
  "generation_failed",
  "patches_generated",
  "qa_approved",
  "game_ready",
  "delivery_email_failed",
  "delivery_email_fallback",
  "game_opened",
  "scene_started",
  "target_found",
  "hint_used",
  "scene_completed",
  "game_completed",
  "game_replayed",
  "share_opened",
  "share_clicked",
  "game_deleted",
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

/** Only these property keys are allowed — a whitelist beats a blacklist for PII. */
export const ALLOWED_PROPS = [
  "gameId",
  "sceneSlug",
  "targetId",
  "packageTier",
  "sceneCount",
  "hintLevel",
  "hintsUsed",
  "misses",
  "playIndex",
  "durationMs",
  "costCents",
  "generated",
  "skipped",
  "failed",
  "deviceType",
  "step",
  "reason",
  "channel",
  "variant",
] as const;

export type AnalyticsProps = Partial<Record<(typeof ALLOWED_PROPS)[number], string | number | boolean>>;

export function sanitizeProps(props: Record<string, unknown> | undefined): AnalyticsProps {
  if (!props) return {};
  const out: Record<string, string | number | boolean> = {};
  for (const key of ALLOWED_PROPS) {
    const v = props[key];
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[key] = v;
  }
  return out as AnalyticsProps;
}
