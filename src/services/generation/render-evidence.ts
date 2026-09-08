/**
 * Private, short-lived raw pictures referenced only by the diagnostic ledger:
 * each attempt's render, every pass-two answer it bought, and — since 8
 * September 2026 — the patch cut from it, the composite the judge was shown
 * and the exact images that went over the judge's wire. Deletion and
 * retention walk these; a picture the ledger points at that they cannot see
 * is a picture of a child that outlives the game.
 */
const SINGLE_KEYS = ["evidenceAssetId", "matteEvidenceAssetId", "patchAssetId", "compositeAssetId"] as const;
const LIST_KEYS = ["matteEvidenceAssetIds", "judgeImageAssetIds"] as const;

function idsOf(attempt: unknown): string[] {
  const a = attempt as Record<string, unknown> | null;
  const out: string[] = [];
  for (const key of SINGLE_KEYS) if (typeof a?.[key] === "string") out.push(a[key] as string);
  for (const key of LIST_KEYS) if (Array.isArray(a?.[key])) for (const id of a[key] as unknown[]) if (typeof id === "string") out.push(id);
  return [...new Set(out)];
}

export function renderEvidenceIds(usageJson: string | null | undefined): string[] {
  try {
    const raw = JSON.parse(usageJson ?? "{}");
    const attempts: unknown[] = Array.isArray(raw?.ledger?.attempts) ? raw.ledger.attempts : [];
    return [...new Set(attempts.flatMap(idsOf))];
  } catch { return []; }
}

export function removeRenderEvidence(usageJson: string | null, gone: ReadonlySet<string>): string | null {
  try {
    const raw = JSON.parse(usageJson ?? "{}");
    if (!Array.isArray(raw?.ledger?.attempts)) return usageJson;
    let changed = false;
    for (const attempt of raw.ledger.attempts) {
      if (!attempt) continue;
      for (const key of SINGLE_KEYS) {
        if (gone.has(attempt[key])) { delete attempt[key]; changed = true; }
      }
      for (const key of LIST_KEYS) {
        if (!Array.isArray(attempt[key])) continue;
        const kept = attempt[key].filter((id: unknown) => !gone.has(id as string));
        if (kept.length !== attempt[key].length) {
          changed = true;
          if (kept.length > 0) attempt[key] = kept;
          else delete attempt[key];
        }
      }
    }
    return changed ? JSON.stringify(raw) : usageJson;
  } catch { return usageJson; }
}
