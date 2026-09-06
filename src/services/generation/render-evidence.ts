/** Private, short-lived raw renders referenced only by the diagnostic ledger. */
export function renderEvidenceIds(usageJson: string | null | undefined): string[] {
  try {
    const raw = JSON.parse(usageJson ?? "{}");
    const attempts: unknown[] = Array.isArray(raw?.ledger?.attempts) ? raw.ledger.attempts : [];
    return attempts.flatMap(a => {
      const id = (a as { evidenceAssetId?: unknown } | null)?.evidenceAssetId;
      return typeof id === "string" ? [id] : [];
    });
  } catch { return []; }
}

export function removeRenderEvidence(usageJson: string | null, gone: ReadonlySet<string>): string | null {
  try {
    const raw = JSON.parse(usageJson ?? "{}");
    if (!Array.isArray(raw?.ledger?.attempts)) return usageJson;
    let changed = false;
    for (const attempt of raw.ledger.attempts) {
      if (attempt && gone.has(attempt.evidenceAssetId)) { delete attempt.evidenceAssetId; changed = true; }
    }
    return changed ? JSON.stringify(raw) : usageJson;
  } catch { return usageJson; }
}
