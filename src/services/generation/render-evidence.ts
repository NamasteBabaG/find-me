/**
 * Private, short-lived raw pictures referenced only by the diagnostic ledger:
 * each attempt's render, and every pass-two answer it bought. Deletion and
 * retention walk these; a picture the ledger points at that they cannot see
 * is a picture of a child that outlives the game.
 */
function idsOf(attempt: unknown): string[] {
  const a = attempt as { evidenceAssetId?: unknown; matteEvidenceAssetId?: unknown; matteEvidenceAssetIds?: unknown } | null;
  const out: string[] = [];
  if (typeof a?.evidenceAssetId === "string") out.push(a.evidenceAssetId);
  if (typeof a?.matteEvidenceAssetId === "string") out.push(a.matteEvidenceAssetId);
  if (Array.isArray(a?.matteEvidenceAssetIds)) for (const id of a.matteEvidenceAssetIds) if (typeof id === "string") out.push(id);
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
      for (const key of ["evidenceAssetId", "matteEvidenceAssetId"] as const) {
        if (gone.has(attempt[key])) { delete attempt[key]; changed = true; }
      }
      if (Array.isArray(attempt.matteEvidenceAssetIds)) {
        const kept = attempt.matteEvidenceAssetIds.filter((id: unknown) => !gone.has(id as string));
        if (kept.length !== attempt.matteEvidenceAssetIds.length) {
          changed = true;
          if (kept.length > 0) attempt.matteEvidenceAssetIds = kept;
          else delete attempt.matteEvidenceAssetIds;
        }
      }
    }
    return changed ? JSON.stringify(raw) : usageJson;
  } catch { return usageJson; }
}
