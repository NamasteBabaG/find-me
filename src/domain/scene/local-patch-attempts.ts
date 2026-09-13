/** One first pass, then a second pass and one final repair. Never a fourth purchase. */
export const LOCAL_PATCH_NORMAL_ATTEMPTS = 2;
export const LOCAL_PATCH_MAX_ATTEMPTS = 3;
/** Four is available only to an independently verified, scoped operator grant. */
export type LocalPatchAttemptLimit = 2 | 3 | 4;
export type LocalPatchAttemptState = { readonly status: string; readonly attempts: number };

/** New strict worlds share the same retry contract everywhere. Legacy worlds
 * keep their historical QA-only third attempt; this never authorizes spending. */
export function localPatchFinalRepairAllowed(appEnv: string | undefined, strictWorld: boolean) {
  return strictWorld || appEnv === "qa";
}

export function nextLocalPatchAttempt(row: LocalPatchAttemptState, limit: LocalPatchAttemptLimit = LOCAL_PATCH_NORMAL_ATTEMPTS) {
  const attempt = row.status === "PENDING" && row.attempts > 0 ? row.attempts : row.attempts + 1;
  return { attempt, exhausted: attempt > limit };
}

export function localPatchSettled(row: LocalPatchAttemptState | undefined, limit: LocalPatchAttemptLimit) {
  return !!row && (["GENERATED", "APPROVED"].includes(row.status) || nextLocalPatchAttempt(row, limit).exhausted);
}

/** Repairs wait for EVERY normal placement, including an interrupted attempt. */
export function localPatchAttemptPlan(rows: readonly (LocalPatchAttemptState | undefined)[], allowRepair: boolean) {
  // An interrupted third attempt may already be paid. Finish that same key;
  // a later refusal from another board does not turn recovery into a new buy.
  const resumeRepair = allowRepair ? rows.flatMap((row, index) =>
    row?.status === "PENDING" && row.attempts === LOCAL_PATCH_MAX_ATTEMPTS ? [index] : []) : [];
  if (resumeRepair.length) return { finalRepair: true, indices: resumeRepair };
  // A completed refusal must not take a second purchase ahead of an untouched
  // hide anywhere in the world. Already-started normal attempts are resumed,
  // not renamed or reset: their durable request may already have been paid.
  const first = rows.flatMap((row, index) => !localPatchSettled(row, LOCAL_PATCH_NORMAL_ATTEMPTS)
    && (!row || row.attempts === 0
      || row.status === "PENDING" && row.attempts <= LOCAL_PATCH_NORMAL_ATTEMPTS) ? [index] : []);
  if (first.length) return { finalRepair: false, indices: first };
  const normal = rows.flatMap((row, index) => localPatchSettled(row, LOCAL_PATCH_NORMAL_ATTEMPTS) ? [] : [index]);
  if (normal.length) return { finalRepair: false, indices: normal };
  return { finalRepair: allowRepair, indices: allowRepair
    ? rows.flatMap((row, index) => localPatchSettled(row, LOCAL_PATCH_MAX_ATTEMPTS) ? [] : [index]) : [] };
}
