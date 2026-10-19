/**
 * One Sol continuity question asked as an OpenAI background response and polled
 * across worker slices (`openai-responses-background/v1`). Pure: no HTTP or DB.
 *
 * The record is append-only events whose names are their compare-and-set:
 *
 *   intent ─► claim ─► submitted{responseId} ─► [cancel] ─► outcome
 *                   ├► refused   (a documented refusal: nothing was created)
 *                   └► lost      (the create's answer never arrived: unknown)
 *
 * Rules:
 *  1. The intent (world, request key, fingerprint, exact body digest, binding and
 *     reservation) is written BEFORE the one create; the reservation stays whole
 *     until a genuine provider result with usage is retained.
 *  2. There is exactly one create per round, ever. A known response id is only
 *     ever polled. A failed poll is not a failed review: the round waits.
 *  3. A claimed create with no recorded answer may still be in flight in another
 *     worker; once its grace has passed it is `lost`: an unknown charge, kept in
 *     full, recoverable only by a separately admitted new question.
 *  4. A response still running past its cancel deadline is cancelled once and
 *     polled on; whatever it ends as is recorded honestly. One the provider no
 *     longer has (expired, never read) is `missing`: unknown, held.
 */
import { leanReviewPolicyOf } from "./visual-review-policy";

export const BACKGROUND_REVIEW_ROUND_VERSION = "sol-background-round/v1" as const;
export const BACKGROUND_REVIEW_TRANSPORT = "openai-responses-background/v1" as const;
/** A create's own timeout and the room to record its answer. */
export const BACKGROUND_CREATE_GRACE_MS = 3 * 60_000;
/** A background HIGH review normally finishes in minutes; past this it is cancelled. */
export const BACKGROUND_CANCEL_AFTER_MS = 25 * 60_000;
/**
 * A lean world's Flex question (local-patch-lean/v1). On the first lean QA world (19 October) eleven of twelve
 * Flex answers took 0:29 to 2:50, and one was still queued at 25 minutes. Past ten minutes it is cancelled, and its
 * appearance's evidence question is asked again, so a stalled answer costs one appearance minutes, not half an hour.
 */
export const LEAN_FLEX_CANCEL_AFTER_MS = 10 * 60_000;
/** The cancel deadline of the policy a round was created with: a lean Flex question's, else the historical one. */
export function backgroundCancelAfterMs(intent: Pick<BackgroundReviewIntent, "policyVersion">): number {
  return intent.policyVersion !== undefined && leanReviewPolicyOf(intent.policyVersion)?.serviceTier === "flex"
    ? LEAN_FLEX_CANCEL_AFTER_MS : BACKGROUND_CANCEL_AFTER_MS;
}

export type BackgroundReviewBinding = { readonly hideId: string; readonly variantId: string; readonly imageSha256: string;
  readonly geometrySha256: string; readonly identitySha256: string };
export type BackgroundReviewIntent = {
  readonly version: typeof BACKGROUND_REVIEW_ROUND_VERSION; readonly roundId: string; readonly gameId: string; readonly worldId: string;
  readonly requestKey: string; readonly fingerprint: string; readonly bodySha256: string; readonly reserveMicroUsd: number;
  readonly binding: BackgroundReviewBinding;
  /** A lean world's question (local-patch-lean/v1) names its exact policy; absent on every Sol continuity round before it. */
  readonly policyVersion?: string;
};
export type BackgroundOutcomeState = "answered" | "unusable" | "unpriced" | "missing";
export type BackgroundReviewEvent =
  | { readonly kind: "intent"; readonly intent: BackgroundReviewIntent }
  | { readonly kind: "claim"; readonly at: number }
  | { readonly kind: "submitted"; readonly responseId: string; readonly at: number }
  | { readonly kind: "refused"; readonly status: number; readonly errorType: string | null; readonly at: number }
  | { readonly kind: "lost"; readonly reason: string; readonly at: number }
  | { readonly kind: "cancel"; readonly at: number }
  | { readonly kind: "outcome"; readonly state: BackgroundOutcomeState; readonly responseId: string; readonly providerStatus: string; readonly at: number };

export const backgroundEventName = (event: BackgroundReviewEvent) => event.kind;

export type BackgroundReviewRound = {
  readonly intent: BackgroundReviewIntent;
  readonly claimAt: number | null;
  readonly submitted: { readonly responseId: string; readonly at: number } | null;
  readonly cancelAt: number | null;
  /** refused, lost or outcome: the round asks nothing more of the provider. */
  readonly terminal: Extract<BackgroundReviewEvent, { kind: "refused" | "lost" | "outcome" }> | null;
};

/** The round its events describe. A record that contradicts its own rules is refused, never repaired. */
export function backgroundRoundOf(events: readonly BackgroundReviewEvent[]): BackgroundReviewRound {
  const first = events[0];
  if (!first || first.kind !== "intent") throw Error("BACKGROUND_REVIEW: a round starts with its intent");
  const once = (kind: BackgroundReviewEvent["kind"]) => {
    const found = events.filter(e => e.kind === kind);
    if (found.length > 1) throw Error(`BACKGROUND_REVIEW: ${kind} recorded twice`);
    return found[0] ?? null;
  };
  const claim = once("claim") as Extract<BackgroundReviewEvent, { kind: "claim" }> | null;
  const submitted = once("submitted") as Extract<BackgroundReviewEvent, { kind: "submitted" }> | null;
  const cancel = once("cancel") as Extract<BackgroundReviewEvent, { kind: "cancel" }> | null;
  const terminals = events.filter((e): e is Extract<BackgroundReviewEvent, { kind: "refused" | "lost" | "outcome" }> =>
    e.kind === "refused" || e.kind === "lost" || e.kind === "outcome");
  once("intent");
  if (terminals.length > 1) throw Error("BACKGROUND_REVIEW: a round has one outcome");
  const terminal = terminals[0] ?? null;
  if ((submitted || terminal) && !claim) throw Error("BACKGROUND_REVIEW: nothing is sent without its claim");
  if (submitted && terminal && terminal.kind !== "outcome") throw Error("BACKGROUND_REVIEW: a submitted response ends only in an outcome");
  if (terminal?.kind === "outcome" && (!submitted || terminal.responseId !== submitted.responseId)) throw Error("BACKGROUND_REVIEW: an outcome belongs to the submitted response");
  if (cancel && !submitted) throw Error("BACKGROUND_REVIEW: only a submitted response is cancelled");
  return { intent: first.intent, claimAt: claim?.at ?? null, submitted: submitted ? { responseId: submitted.responseId, at: submitted.at } : null,
    cancelAt: cancel?.at ?? null, terminal };
}

export type BackgroundStep =
  | { readonly step: "create" }
  | { readonly step: "wait"; readonly reason: string }
  | { readonly step: "lost" }
  | { readonly step: "poll"; readonly responseId: string; readonly cancelDue: boolean }
  | { readonly step: "done" };

export function nextBackgroundStep(round: BackgroundReviewRound, now: number): BackgroundStep {
  if (round.terminal) return { step: "done" };
  if (round.claimAt === null) return { step: "create" };
  if (!round.submitted) return now - round.claimAt < BACKGROUND_CREATE_GRACE_MS
    ? { step: "wait", reason: "another worker's create may still be answering" } : { step: "lost" };
  return { step: "poll", responseId: round.submitted.responseId,
    cancelDue: round.cancelAt === null && now - round.submitted.at >= backgroundCancelAfterMs(round.intent) };
}
