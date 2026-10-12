/**
 * Recovery from evidence that could not be used, as distinct from a picture that
 * failed. Pure: the caller supplies the candidate's attempt history and the time.
 *
 * The previous rule allowed three questions, waited an hour, and allowed three
 * more, forever. An answer that failed the same way every time therefore kept
 * buying the same question (one candidate reached attempt nine). Here every
 * failure is classified, the next question changes in a way that addresses the
 * class, a strategy that failed twice is never asked again, and a candidate has
 * a fixed total. A pause never resets a count.
 */
export const LOCAL_PATCH_EVIDENCE_POLICY = "local-patch-evidence-recovery/v2" as const;
/** Review rounds per candidate image, the first review included. */
export const LOCAL_PATCH_EVIDENCE_ROUND_CAP = 4;
/** Only a transport failure waits; a format failure is answered by a different question now. */
export const LOCAL_PATCH_EVIDENCE_TRANSPORT_BACKOFF_MS = 60 * 60_000;

export type EvidenceRole = "quality" | "continuity";
export type EvidenceFaultKind =
  | "transport" | "wrong-model" | "truncated"
  | "empty" | "syntax" | "shape" | "ids" | "length" | "count" | "oversize"
  | "unsure" | "conflict" | "unknown";
export type EvidenceStrategy = "standard/v1" | "strict-json/v1" | "compact/v1" | "decide/v1";
export type EvidenceFamily = "transport" | "format" | "size" | "visual";
/** One failed round. Codes and JSON paths only: answer text never enters a log. */
export type EvidenceAttempt = {
  readonly attempt: number; readonly role: EvidenceRole; readonly kind: EvidenceFaultKind;
  readonly code: string | null; readonly path: string | null; readonly strategy: EvidenceStrategy;
  readonly at: string; readonly imageSha256: string;
};
export type EvidenceDiagnosis = {
  readonly policy: typeof LOCAL_PATCH_EVIDENCE_POLICY; readonly role: EvidenceRole; readonly family: EvidenceFamily;
  readonly kind: EvidenceFaultKind; readonly code: string | null; readonly path: string | null;
  readonly imageSha256: string; readonly rounds: number;
  readonly tried: readonly { readonly attempt: number; readonly kind: EvidenceFaultKind; readonly strategy: EvidenceStrategy }[];
  readonly next: EvidenceStrategy | "wait" | "repair" | "exhausted";
};
export type EvidenceStep =
  | { readonly action: "ask"; readonly attempt: number; readonly role: EvidenceRole; readonly strategy: EvidenceStrategy; readonly diagnosis: EvidenceDiagnosis | null }
  | { readonly action: "wait"; readonly attempt: number; readonly role: EvidenceRole; readonly strategy: EvidenceStrategy; readonly retryAt: number; readonly diagnosis: EvidenceDiagnosis }
  | { readonly action: "repair"; readonly diagnosis: EvidenceDiagnosis }
  | { readonly action: "exhausted"; readonly diagnosis: EvidenceDiagnosis };

export function evidenceFamily(kind: EvidenceFaultKind): EvidenceFamily {
  if (kind === "transport" || kind === "wrong-model") return "transport";
  if (kind === "truncated" || kind === "length" || kind === "count" || kind === "oversize") return "size";
  if (kind === "unsure" || kind === "conflict") return "visual";
  return "format";
}

/** What the next question changes, per family: never the model, effort or policy. */
const ESCALATION: Record<Exclude<EvidenceFamily, "transport">, EvidenceStrategy> = {
  format: "strict-json/v1", size: "compact/v1", visual: "decide/v1",
};

/**
 * The next legal step for one candidate, from its own failed rounds in order.
 * `repair` is the existing automatic image route and is offered ONLY for an
 * independent reviewer that stayed explicitly uncertain about the pixels after a
 * decisive question; a malformed or missing answer never authorizes a new image.
 */
export function nextLocalPatchEvidenceStep(history: readonly EvidenceAttempt[], now: number): EvidenceStep | null {
  if (!history.length) return null;
  const last = history.at(-1)!, family = evidenceFamily(last.kind);
  const rounds = Math.max(...history.map(h => h.attempt));
  const mine = history.filter(h => h.role === last.role && evidenceFamily(h.kind) === family);
  const diagnosis = (next: EvidenceDiagnosis["next"]): EvidenceDiagnosis => ({ policy: LOCAL_PATCH_EVIDENCE_POLICY, role: last.role, family,
    kind: last.kind, code: last.code, path: last.path, imageSha256: last.imageSha256, rounds,
    tried: history.map(h => ({ attempt: h.attempt, kind: h.kind, strategy: h.strategy })), next });
  const ask = (strategy: EvidenceStrategy, changed: boolean): EvidenceStep => rounds >= LOCAL_PATCH_EVIDENCE_ROUND_CAP
    ? { action: "exhausted", diagnosis: diagnosis("exhausted") }
    : { action: "ask", attempt: rounds + 1, role: last.role, strategy, diagnosis: changed ? diagnosis(strategy) : null };
  if (family === "visual") {
    // A decisive question that still could not establish the anatomy is a fact
    // about these pixels, which the bounded image route may replace.
    if (mine.some(h => h.strategy === "decide/v1")) return { action: "repair", diagnosis: diagnosis("repair") };
    return ask("decide/v1", true);
  }
  if (family === "transport") {
    // The same question again: nothing about it was wrong. Two consecutive
    // transport failures wait out an outage, then continue against the same cap.
    const streak = history.length >= 2 && history.slice(-2).every(h => evidenceFamily(h.kind) === "transport");
    const retryAt = Date.parse(last.at) + LOCAL_PATCH_EVIDENCE_TRANSPORT_BACKOFF_MS;
    if (streak && rounds < LOCAL_PATCH_EVIDENCE_ROUND_CAP) {
      // A record whose time cannot be read can neither wait forever nor buy now.
      if (!Number.isFinite(retryAt)) return { action: "exhausted", diagnosis: diagnosis("exhausted") };
      if (now < retryAt) return { action: "wait", attempt: rounds + 1, role: last.role, strategy: last.strategy, retryAt, diagnosis: diagnosis("wait") };
    }
    return ask(last.strategy, false);
  }
  // A format or size failure repeats deterministically: the identical question
  // is never bought twice. Its escalation may fail once more, then it is retired.
  const escalation = ESCALATION[family];
  if (mine.filter(h => h.strategy === escalation).length >= 2) return { action: "exhausted", diagnosis: diagnosis("exhausted") };
  return ask(escalation, last.strategy !== escalation);
}
