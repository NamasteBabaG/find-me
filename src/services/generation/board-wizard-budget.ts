import { auditWorldBudget, WorldBudget, WorldBudgetError, type WorldBudgetRepository, type WorldReservationInput, type WorldChargeEvidence, type WorldBudgetOptions, type WorldUnknownContinuationInput } from "./world-budget";

export const BOARD_WIZARD_CAP_MICRO_USD = 4_000_000;
export interface BoardWizardBudgetExtension { worldId: string; capMicroUsd: 5_000_000; authorizationSha256: string }
export type BoardWizardBudgetExtensionResolver = (worldId: string) => Promise<BoardWizardBudgetExtension | null>;
/** Narrower commercial cap, enforced INSIDE the same serializable transaction.
 * Actual settlements/imports are never discarded, including provider overruns. */
export function boardWizardBudget(repository: WorldBudgetRepository, attempt = 1, options: WorldBudgetOptions = {}, resolveExtension?: BoardWizardBudgetExtensionResolver) {
  if (attempt !== 1 && attempt !== 2) throw new Error("Only two board attempts are authorized");
  const capFor = async (worldId: string) => {
    const extension = await resolveExtension?.(worldId);
    if (!extension) return BOARD_WIZARD_CAP_MICRO_USD;
    if (extension.worldId !== worldId || extension.capMicroUsd !== 5_000_000 || !/^[a-f0-9]{64}$/.test(extension.authorizationSha256)) {
      throw new WorldBudgetError("invalid_input", "Verified budget extension does not bind this exact world");
    }
    return extension.capMicroUsd;
  };
  const guarded: WorldBudgetRepository = { transactWorld: (worldId, work) => repository.transactWorld(worldId, tx => work({ snapshot: tx.snapshot,
    createRequest: async request => {
      if (request.origin === "reserved" && auditWorldBudget(tx.snapshot).committedMicroUsd + request.reserveMicroUsd > await capFor(worldId)) {
        throw new WorldBudgetError("cap_exceeded", "Reservation exceeds the inclusive authorized QA world ceiling");
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
      const overCapMicroUsd = Math.max(0, audit.committedMicroUsd - capMicroUsd), remainingMicroUsd = Math.max(0, capMicroUsd - audit.committedMicroUsd);
      const held = audit.held || overCapMicroUsd > 0;
      return { ...audit, capMicroUsd, overCapMicroUsd, remainingMicroUsd, held, canReserve: !held && remainingMicroUsd > 0,
        state: held ? "held" as const : remainingMicroUsd === 0 ? "exhausted" as const : "open" as const };
    }
    override reserve(worldId: string, input: WorldReservationInput) { return super.reserve(worldId, { ...input, requestKey: key(input.requestKey) }); }
    override readRequest(worldId: string, requestKey: string) { return super.readRequest(worldId, key(requestKey)); }
    override settle(worldId: string, requestKey: string, evidence: WorldChargeEvidence) { return super.settle(worldId, key(requestKey), evidence); }
    override markUnknown(worldId: string, requestKey: string, reason: string) { return super.markUnknown(worldId, key(requestKey), reason); }
    override readContinuationApproval(worldId: string, requestKey: string) { return super.readContinuationApproval(worldId, key(requestKey)); }
    override authorizeUnknownContinuation(worldId: string, input: WorldUnknownContinuationInput) { return super.authorizeUnknownContinuation(worldId, { ...input, requestKey: key(input.requestKey) }); }
  }
  return new AttemptBudget(guarded, options);
}
