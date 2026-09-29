import { localPatchBoardForVersion } from "./local-patch-catalog";

/** Only independently fingerprinted collection reviews qualify for automatic
 * interruption recovery. Historical grouped questions retain their own rules. */
export function interruptedLocalPatchReviewRequest(key: string, fingerprint: string) {
  const match = /^self-repair:board:([a-z]+):([a-f0-9]{64})$/.exec(key);
  const board = match && localPatchBoardForVersion(match[1]!, 12);
  return board && match![2] === fingerprint ? board : null;
}
