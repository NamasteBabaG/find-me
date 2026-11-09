import { QA_PILOT_COMPLETION_CAP_MICRO_USD } from "../../domain/generation/qa-world-budget-policy";
import { SUNBURST_IMAGE_RESERVE_MICRO_USD } from "../../domain/generation/sunburst-painter";
import { auditWorldBudget, WorldBudget, WorldBudgetError, type WorldBudgetAudit, type WorldBudgetRepository, type WorldReservationInput, type WorldLinkInput, type WorldChargeEvidence, type WorldBudgetOptions, type WorldUnknownContinuationInput, type WorldAutomaticImageRecoveryInput, type WorldAutomaticReviewRecoveryInput, type WorldAutomaticReviewRecoveryV2Input, type WorldAutomaticReviewRecoveryV3Input, type WorldAutomaticReviewRecoveryV4Input, type WorldAutomaticReviewRecoveryV5Input } from "./world-budget";

export const BOARD_WIZARD_CAP_MICRO_USD = 4_000_000;
/** A lean world's ceiling (local-patch-lean/v1): four dollars. A separately authenticated completion grant may authorize one existing source revision. The owner's, 19 October 2026: the
 * target stays under three, and a world a few cents over it must never stop for them. */
export const LEAN_BOARD_WIZARD_CAP_MICRO_USD = 4_000_000;
/** Read-only consumers must show the SAME commercial ceiling as reservations,
 * not the generic ledger's wider5USD maximum. This never grants an extension. */
export function applyBoardWizardBudgetCap(audit: WorldBudgetAudit, capMicroUsd = BOARD_WIZARD_CAP_MICRO_USD): WorldBudgetAudit {
  if (capMicroUsd !== BOARD_WIZARD_CAP_MICRO_USD && capMicroUsd !== LEAN_BOARD_WIZARD_CAP_MICRO_USD && capMicroUsd !== 5_000_000
    && capMicroUsd !== 6_000_000 && capMicroUsd !== 8_000_000 && capMicroUsd !== 10_000_000 && capMicroUsd !== QA_PILOT_COMPLETION_CAP_MICRO_USD)
    throw new Error("Unsupported verified QA budget cap");
  const overCapMicroUsd = Math.max(0, audit.committedMicroUsd - capMicroUsd), remainingMicroUsd = Math.max(0, capMicroUsd - audit.committedMicroUsd);
  const held = audit.held || overCapMicroUsd > 0;
  return { ...audit, capMicroUsd, overCapMicroUsd, remainingMicroUsd, held, canReserve: !held && remainingMicroUsd > 0,
    state: held ? "held" : remainingMicroUsd === 0 ? "exhausted" : "open" };
}
/** A verified grant above the default ceiling. */
export interface BoardWizardBudgetGrant { worldId: string; capMicroUsd: 5_000_000 | 6_000_000 | 8_000_000 | 10_000_000 | typeof QA_PILOT_COMPLETION_CAP_MICRO_USD; authorizationSha256: string;
  /** The extra dollar admits only the named new painting. Old pictures replay,
   * and their full ordinary review reservations still use the cumulative cap. */
  readonly imageAboveBaseOnly?: { readonly baseCapMicroUsd: 4_000_000; readonly requestKey: string; readonly reserveMicroUsd: number };
  /** explicit-existing-qa-sunburst-tail-completion/v1: the same rule for a frozen finite set
   * of at most three named Sunburst images, each at exactly its 150000 reservation. Never
   * beside `imageAboveBaseOnly`. */
  readonly imageAboveBaseSet?: { readonly baseCapMicroUsd: 4_000_000; readonly requests: readonly { readonly requestKey: string; readonly reserveMicroUsd: number }[] } }
/** At most this many named images in one finite set. */
export const IMAGE_ABOVE_BASE_SET_MAX = 3;
/** A lean world's lower ceiling (local-patch-lean/v1): never a grant. */
export interface BoardWizardBudgetCeiling { worldId: string; capMicroUsd: typeof LEAN_BOARD_WIZARD_CAP_MICRO_USD; authorizationSha256: string }
export type BoardWizardBudgetExtension = BoardWizardBudgetGrant | BoardWizardBudgetCeiling;
export type BoardWizardBudgetExtensionResolver = (worldId: string) => Promise<BoardWizardBudgetExtension | null>;
/** Narrower commercial cap, enforced INSIDE the same serializable transaction.
 * Actual settlements/imports are never discarded, including provider overruns. */
export function boardWizardBudget(repository: WorldBudgetRepository, attempt = 1, options: WorldBudgetOptions = {}, resolveExtension?: BoardWizardBudgetExtensionResolver) {
  if (attempt !== 1 && attempt !== 2) throw new Error("Only two board attempts are authorized");
  const authorityFor = async (worldId: string) => {
    const extension = await resolveExtension?.(worldId);
    if (!extension) return { cap: BOARD_WIZARD_CAP_MICRO_USD, imageAboveBaseOnly: undefined, imageAboveBaseSet: undefined };
    if (extension.worldId !== worldId || (extension.capMicroUsd !== LEAN_BOARD_WIZARD_CAP_MICRO_USD && extension.capMicroUsd !== 5_000_000
      && extension.capMicroUsd !== 6_000_000 && extension.capMicroUsd !== 8_000_000 && extension.capMicroUsd !== 10_000_000 && extension.capMicroUsd !== QA_PILOT_COMPLETION_CAP_MICRO_USD) || !/^[a-f0-9]{64}$/.test(extension.authorizationSha256)) {
      throw new WorldBudgetError("invalid_input", "Verified budget extension does not bind this exact world");
    }
    const imageAboveBaseOnly = "imageAboveBaseOnly" in extension ? extension.imageAboveBaseOnly : undefined;
    if (imageAboveBaseOnly && (extension.capMicroUsd !== 5_000_000 || imageAboveBaseOnly.baseCapMicroUsd !== 4_000_000
      || !/^[A-Za-z0-9_:.-]{1,240}$/.test(imageAboveBaseOnly.requestKey)
      || !Number.isSafeInteger(imageAboveBaseOnly.reserveMicroUsd) || imageAboveBaseOnly.reserveMicroUsd <= 0))
      throw new WorldBudgetError("invalid_input", "Finite image capacity must bind one exact request at the original ceiling");
    const imageAboveBaseSet = "imageAboveBaseSet" in extension ? extension.imageAboveBaseSet : undefined;
    if (imageAboveBaseSet && (imageAboveBaseOnly || extension.capMicroUsd !== 5_000_000 || imageAboveBaseSet.baseCapMicroUsd !== 4_000_000
      || !Array.isArray(imageAboveBaseSet.requests) || imageAboveBaseSet.requests.length < 1 || imageAboveBaseSet.requests.length > IMAGE_ABOVE_BASE_SET_MAX
      || new Set(imageAboveBaseSet.requests.map(r => r.requestKey)).size !== imageAboveBaseSet.requests.length
      || imageAboveBaseSet.requests.some(r => !/^[A-Za-z0-9_:.-]{1,240}$/.test(r.requestKey) || r.reserveMicroUsd !== SUNBURST_IMAGE_RESERVE_MICRO_USD)))
      throw new WorldBudgetError("invalid_input", "Finite image set must bind at most three distinct exact requests at the original ceiling");
    return { cap: extension.capMicroUsd, imageAboveBaseOnly, imageAboveBaseSet };
  };
  const capFor = async (worldId: string) => (await authorityFor(worldId)).cap;
  const reservationCapFor = async (worldId: string, request: { scope: string; requestKey: string; reserveMicroUsd: number }) => {
    const { cap, imageAboveBaseOnly: only, imageAboveBaseSet: set } = await authorityFor(worldId);
    if (set) {
      // Like the single named image: a named key with the wrong scope or reservation refuses even below four dollars.
      const named = set.requests.find(r => r.requestKey === request.requestKey);
      if (named && (request.scope !== "image" || request.reserveMicroUsd !== named.reserveMicroUsd))
        throw new WorldBudgetError("invalid_input", "Named completion image requires its exact scope and reservation");
      return request.scope !== "judge" && !named ? set.baseCapMicroUsd : cap;
    }
    if (only && request.requestKey === only.requestKey && (request.scope !== "image" || request.reserveMicroUsd !== only.reserveMicroUsd))
      throw new WorldBudgetError("invalid_input", "Named completion image requires its exact scope and reservation");
    return only && request.scope !== "judge" && request.requestKey !== only.requestKey ? only.baseCapMicroUsd : cap;
  };
  const guarded: WorldBudgetRepository = { transactWorld: (worldId, work) => repository.transactWorld(worldId, tx => work({ snapshot: tx.snapshot,
    createRequest: async request => {
      // Only a new reservation asks for capacity. A linked alias's charge is the canonical row's, counted once;
      // an unknown charge recorded as spent (`recordUnknown`) grants no dispatch and must be counted whatever the room.
      if (request.origin === "reserved" && request.state === "pending" && auditWorldBudget(tx.snapshot).committedMicroUsd + request.reserveMicroUsd > await reservationCapFor(worldId, request)) {
        throw new WorldBudgetError("cap_exceeded", "Reservation exceeds the inclusive authorized QA world ceiling",
          { worldId, requestKey: request.requestKey, scope: request.scope, operationFingerprint: request.operationFingerprint,
            reserveMicroUsd: request.reserveMicroUsd });
      }
      return tx.createRequest(request);
    },
    updateRequest: (key, request) => tx.updateRequest(key, request),
    ...(tx.appendUnknownContinuationApproval ? { appendUnknownContinuationApproval: (approval: Parameters<NonNullable<typeof tx.appendUnknownContinuationApproval>>[0]) => tx.appendUnknownContinuationApproval!(approval) } : {}),
  })) };
  const key = (value: string) => attempt === 1 ? value : `attempt-2:${value}`;
  class AttemptBudget extends WorldBudget {
    override async audit(worldId: string) {
      const audit = await super.audit(worldId), capMicroUsd = await capFor(worldId);
      return applyBoardWizardBudgetCap(audit, capMicroUsd);
    }
    override reserve(worldId: string, input: WorldReservationInput) { return super.reserve(worldId, { ...input, requestKey: key(input.requestKey) }); }
    override readRequest(worldId: string, requestKey: string) { return super.readRequest(worldId, key(requestKey)); }
    override settle(worldId: string, requestKey: string, evidence: WorldChargeEvidence, options?: { onlyPending?: boolean }) { return super.settle(worldId, key(requestKey), evidence, options); }
    override link(worldId: string, input: WorldLinkInput) { return super.link(worldId, { ...input, requestKey: key(input.requestKey), canonicalRequestKey: key(input.canonicalRequestKey) }); }
    override markUnknown(worldId: string, requestKey: string, reason: string, options?: { onlyPending?: boolean }) { return super.markUnknown(worldId, key(requestKey), reason, options); }
    override recordUnknown(worldId: string, input: WorldReservationInput & { reason: string }) { return super.recordUnknown(worldId, { ...input, requestKey: key(input.requestKey) }); }
    override readContinuationApproval(worldId: string, requestKey: string) { return super.readContinuationApproval(worldId, key(requestKey)); }
    override authorizeUnknownContinuation(worldId: string, input: WorldUnknownContinuationInput) { return super.authorizeUnknownContinuation(worldId, { ...input, requestKey: key(input.requestKey) }); }
    override authorizeAutomaticImageRecovery(worldId: string, input: WorldAutomaticImageRecoveryInput) { return super.authorizeAutomaticImageRecovery(worldId, { ...input, requestKey: key(input.requestKey) }); }
    override authorizeAutomaticReviewRecovery(worldId: string, input: WorldAutomaticReviewRecoveryInput) { return super.authorizeAutomaticReviewRecovery(worldId, { ...input, requestKey: key(input.requestKey) }); }
    override authorizeAutomaticReviewRecoveryV2(worldId: string, input: WorldAutomaticReviewRecoveryV2Input) { return super.authorizeAutomaticReviewRecoveryV2(worldId, { ...input, requestKey: key(input.requestKey) }); }
    override authorizeAutomaticReviewRecoveryV3(worldId: string, input: WorldAutomaticReviewRecoveryV3Input) { return super.authorizeAutomaticReviewRecoveryV3(worldId, { ...input, requestKey: key(input.requestKey) }); }
    override authorizeAutomaticReviewRecoveryV4(worldId: string, input: WorldAutomaticReviewRecoveryV4Input) { return super.authorizeAutomaticReviewRecoveryV4(worldId, { ...input, requestKey: key(input.requestKey) }); }
    override authorizeAutomaticReviewRecoveryV5(worldId: string, input: WorldAutomaticReviewRecoveryV5Input) { return super.authorizeAutomaticReviewRecoveryV5(worldId, { ...input, requestKey: key(input.requestKey) }); }
  }
  return new AttemptBudget(guarded, { ...options,
    // Only this verified resolver can raise the generic maximum for this world.
    resolveCapMicroUsd: async worldId => {
      const cap = await capFor(worldId);
      return cap === 6_000_000 || cap === 8_000_000 || cap === 10_000_000 || cap === QA_PILOT_COMPLETION_CAP_MICRO_USD ? cap : 5_000_000;
    } });
}
