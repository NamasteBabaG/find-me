/** Two normal attempts, then one end-of-world repair. Never a fourth purchase. */
export const LOCAL_PATCH_NORMAL_ATTEMPTS = 2;
export const LOCAL_PATCH_MAX_ATTEMPTS = 3;
export type LocalPatchAttemptLimit = 2 | 3;
export type LocalPatchAttemptState = { readonly status: string; readonly attempts: number };

export function nextLocalPatchAttempt(row: LocalPatchAttemptState, limit: LocalPatchAttemptLimit = LOCAL_PATCH_NORMAL_ATTEMPTS) {
  const attempt = row.status === "PENDING" && row.attempts > 0 ? row.attempts : row.attempts + 1;
  return { attempt, exhausted: attempt > limit };
}

export function localPatchSettled(row: LocalPatchAttemptState | undefined, limit: LocalPatchAttemptLimit) {
  return !!row && (["GENERATED", "APPROVED"].includes(row.status) || nextLocalPatchAttempt(row, limit).exhausted);
}

/** Repairs wait for EVERY normal placement, including an interrupted attempt. */
export function localPatchAttemptPlan(rows: readonly (LocalPatchAttemptState | undefined)[], allowRepair: boolean) {
  const normal = rows.flatMap((row, index) => localPatchSettled(row, LOCAL_PATCH_NORMAL_ATTEMPTS) ? [] : [index]);
  if (normal.length) return { finalRepair: false, indices: normal };
  return { finalRepair: allowRepair, indices: allowRepair
    ? rows.flatMap((row, index) => localPatchSettled(row, LOCAL_PATCH_MAX_ATTEMPTS) ? [] : [index]) : [] };
}
