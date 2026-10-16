import { auditWorldBudget, WorldBudget, WorldBudgetError, type WorldBudgetAudit, type WorldBudgetRepository, type WorldReservationInput, type WorldLinkInput, type WorldChargeEvidence, type WorldBudgetOptions, type WorldUnknownContinuationInput, type WorldAutomaticImageRecoveryInput, type WorldAutomaticReviewRecoveryInput } from "./world-budget";

export const BOARD_WIZARD_CAP_MICRO_USD = 4_000_000;
/** Read-only consumers must show the SAME commercial ceiling as reservations,
 * not the generic ledger's wider5USD maximum. This never grants an extension. */
export function applyBoardWizardBudgetCap(audit: WorldBudgetAudit, capMicroUsd = BOARD_WIZARD_CAP_MICRO_USD): WorldBudgetAudit {
  if (capMicroUsd !== BOARD_WIZARD_CAP_MICRO_USD && capMicroUsd !== 5_000_000 && capMicroUsd !== 6_000_000) throw new Error("Unsupported verified QA budget cap");
  const overCapMicroUsd = Math.max(0, audit.committedMicroUsd - capMicroUsd), remainingMicroUsd = Math.max(0, capMicroUsd - audit.committedMicroUsd);
  const held = audit.held || overCapMicroUsd > 0;
  return { ...audit, capMicroUsd, overCapMicroUsd, remainingMicroUsd, held, canReserve: !held && remainingMicroUsd > 0,
    state: held ? "held" : remainingMicroUsd === 0 ? "exhausted" : "open" };
}
export interface BoardWizardBudgetExtension { worldId: string; capMicroUsd: 5_000_000 | 6_000_000; authorizationSha256: string }
export type BoardWizardBudgetExtensionResolver = (worldId: string) => Promise<BoardWizardBudgetExtension | null>;
/** Narrower commercial cap, enforced INSIDE the same serializable transaction.
 * Actual settlements/imports are never discarded, including provider overruns. */
export function boardWizardBudget(repository: WorldBudgetRepository, attempt = 1, options: WorldBudgetOptions = {}, resolveExtension?: BoardWizardBudgetExtensionResolver) {
  if (attempt !== 1 && attempt !== 2) throw new Error("Only two board attempts are authorized");
  const capFor = async (worldId: string) => {
    const extension = await resolveExtension?.(worldId);
    if (!extension) return BOARD_WIZARD_CAP_MICRO_USD;
    if (extension.worldId !== worldId || (extension.capMicroUsd !== 5_000_000 && extension.capMicroUsd !== 6_000_000) || !/^[a-f0-9]{64}$/.test(extension.authorizationSha256)) {
      throw new WorldBudgetError("invalid_input", "Verified budget extension does not bind this exact world");
    }
    return extension.capMicroUsd;
  };
  const guarded: WorldBudgetRepository = { transactWorld: (worldId, work) => repository.transactWorld(worldId, tx => work({ snapshot: tx.snapshot,
    createRequest: async request => {
      // A linked alias holds no capacity: its charge is the canonical row's, counted once.
      if (request.origin === "reserved" && request.state !== "linked" && auditWorldBudget(tx.snapshot).committedMicroUsd + request.reserveMicroUsd > await capFor(worldId)) {
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
    override markUnknown(worldId: string, requestKey: string, reason: string) { return super.markUnknown(worldId, key(requestKey), reason); }
    override readContinuationApproval(worldId: string, requestKey: string) { return super.readContinuationApproval(worldId, key(requestKey)); }
    override authorizeUnknownContinuation(worldId: string, input: WorldUnknownContinuationInput) { return super.authorizeUnknownContinuation(worldId, { ...input, requestKey: key(input.requestKey) }); }
    override authorizeAutomaticImageRecovery(worldId: string, input: WorldAutomaticImageRecoveryInput) { return super.authorizeAutomaticImageRecovery(worldId, { ...input, requestKey: key(input.requestKey) }); }
    override authorizeAutomaticReviewRecovery(worldId: string, input: WorldAutomaticReviewRecoveryInput) { return super.authorizeAutomaticReviewRecovery(worldId, { ...input, requestKey: key(input.requestKey) }); }
  }
  return new AttemptBudget(guarded, { ...options,
    // Only this verified resolver can raise the generic maximum for this world.
    resolveCapMicroUsd: async worldId => await capFor(worldId) === 6_000_000 ? 6_000_000 : 5_000_000 });
}
