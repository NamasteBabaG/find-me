/**
 * Explicit lifecycle of a Game (the purchased product instance).
 *
 * Rules encoded here (and only here):
 *  • Nothing generates before a payment webhook moves us to PAID.
 *  • Only approved QA (human or, in dev, auto) reaches READY.
 *  • A player never receives a game that is not READY / DELIVERED.
 */
export const GAME_STATUSES = [
  "DRAFT",
  "PHOTO_UPLOADED",
  "PHOTO_VALIDATING",
  "PHOTO_REJECTED",
  "PHOTO_APPROVED",
  "PACKAGE_SELECTED",
  "CHECKOUT_PENDING",
  "PAID",
  "AVATAR_GENERATING",
  "TARGETS_GENERATING",
  "SCENES_COMPOSING",
  "QA_PENDING",
  "NEEDS_REGENERATION",
  "NEEDS_NEW_PHOTO",
  "APPROVED",
  "READY",
  "DELIVERED",
  // edge states
  "PAYMENT_FAILED",
  "GENERATION_FAILED",
  "MANUAL_REVIEW",
  "CANCELLED",
  "REFUNDED",
  "DELETED",
] as const;

export type GameStatus = (typeof GAME_STATUSES)[number];

export function isGameStatus(value: unknown): value is GameStatus {
  return typeof value === "string" && (GAME_STATUSES as readonly string[]).includes(value);
}

const TRANSITIONS: Record<GameStatus, readonly GameStatus[]> = {
  DRAFT: ["PHOTO_UPLOADED", "CANCELLED", "DELETED"],
  PHOTO_UPLOADED: ["PHOTO_VALIDATING", "PHOTO_UPLOADED", "CANCELLED", "DELETED"],
  PHOTO_VALIDATING: ["PHOTO_REJECTED", "PHOTO_APPROVED", "DELETED"],
  PHOTO_REJECTED: ["PHOTO_UPLOADED", "CANCELLED", "DELETED"],
  PHOTO_APPROVED: ["PACKAGE_SELECTED", "PHOTO_UPLOADED", "CANCELLED", "DELETED"],
  PACKAGE_SELECTED: ["PACKAGE_SELECTED", "CHECKOUT_PENDING", "PHOTO_UPLOADED", "CANCELLED", "DELETED"],
  CHECKOUT_PENDING: ["PAID", "PAYMENT_FAILED", "PACKAGE_SELECTED", "CANCELLED", "DELETED"],
  PAYMENT_FAILED: ["CHECKOUT_PENDING", "CANCELLED", "DELETED"],
  PAID: ["AVATAR_GENERATING", "REFUNDED", "MANUAL_REVIEW", "DELETED"],
  AVATAR_GENERATING: ["TARGETS_GENERATING", "GENERATION_FAILED", "NEEDS_NEW_PHOTO", "DELETED"],
  TARGETS_GENERATING: ["SCENES_COMPOSING", "GENERATION_FAILED", "DELETED"],
  SCENES_COMPOSING: ["QA_PENDING", "GENERATION_FAILED", "DELETED"],
  QA_PENDING: ["APPROVED", "NEEDS_REGENERATION", "NEEDS_NEW_PHOTO", "MANUAL_REVIEW", "REFUNDED", "DELETED"],
  NEEDS_REGENERATION: ["TARGETS_GENERATING", "AVATAR_GENERATING", "REFUNDED", "DELETED"],
  NEEDS_NEW_PHOTO: ["AVATAR_GENERATING", "REFUNDED", "DELETED"],
  MANUAL_REVIEW: ["QA_PENDING", "NEEDS_REGENERATION", "REFUNDED", "DELETED"],
  GENERATION_FAILED: ["AVATAR_GENERATING", "TARGETS_GENERATING", "MANUAL_REVIEW", "REFUNDED", "DELETED"],
  APPROVED: ["READY", "DELETED"],
  READY: ["DELIVERED", "NEEDS_REGENERATION", "REFUNDED", "DELETED"],
  DELIVERED: ["NEEDS_REGENERATION", "REFUNDED", "DELETED"],
  CANCELLED: ["DELETED"],
  REFUNDED: ["DELETED"],
  DELETED: [],
};

export function canTransition(from: GameStatus, to: GameStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: GameStatus,
    public readonly to: GameStatus,
  ) {
    super(`Invalid game transition ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function assertTransition(from: GameStatus, to: GameStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

/** States in which the player link may open the game. */
export function isPlayable(status: GameStatus): boolean {
  return status === "READY" || status === "DELIVERED";
}

/** States in which the parent may still edit the draft (photo, package, scenes). */
export function isEditableDraft(status: GameStatus): boolean {
  return (
    status === "DRAFT" ||
    status === "PHOTO_UPLOADED" ||
    status === "PHOTO_REJECTED" ||
    status === "PHOTO_APPROVED" ||
    status === "PACKAGE_SELECTED" ||
    status === "CHECKOUT_PENDING" ||
    status === "PAYMENT_FAILED"
  );
}

/** States where background generation is (or should be) running. */
export function isGenerating(status: GameStatus): boolean {
  return status === "PAID" || status === "AVATAR_GENERATING" || status === "TARGETS_GENERATING" || status === "SCENES_COMPOSING";
}

export function isAwaitingQa(status: GameStatus): boolean {
  return status === "QA_PENDING" || status === "MANUAL_REVIEW" || status === "NEEDS_REGENERATION" || status === "NEEDS_NEW_PHOTO";
}

/** Parent-facing, non-technical progress step (1–4) for the "creating" screen. */
export function creationStep(status: GameStatus): { step: 1 | 2 | 3 | 4; done: boolean; failed: boolean } {
  switch (status) {
    case "PAID":
    case "AVATAR_GENERATING":
      return { step: 1, done: false, failed: false };
    case "TARGETS_GENERATING":
      return { step: 2, done: false, failed: false };
    case "SCENES_COMPOSING":
      return { step: 3, done: false, failed: false };
    case "QA_PENDING":
    case "NEEDS_REGENERATION":
    case "NEEDS_NEW_PHOTO":
    case "MANUAL_REVIEW":
    case "APPROVED":
      return { step: 4, done: false, failed: false };
    case "READY":
    case "DELIVERED":
      return { step: 4, done: true, failed: false };
    case "GENERATION_FAILED":
    case "REFUNDED":
    case "CANCELLED":
    case "DELETED":
      return { step: 1, done: false, failed: true };
    default:
      return { step: 1, done: false, failed: false };
  }
}
