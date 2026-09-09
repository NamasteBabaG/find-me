/** One bounded free local-tone revision per board; original paid sources stay immutable. */
import { mkdirSync, readFileSync } from "node:fs";
import { loadBoardConditioningInputs } from "./board-conditioned-inputs";
import { writeImmutableBytes } from "./board-conditioned-probe-replay";
import { sha256Bytes } from "../src/services/generation/fixed-sprite";

async function main() {
  const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
  const planPath = "work/open-placement-20260909/final-visual-review-v4/plan.json", plan = read(planPath);
  const grades = { amazon: [[-.65, .72], [-.50, .72], [-.65, .70]], paris: [[-.55, .75], [-.20, .78], [-.65, .70]] } as const;
  for (const boardId of ["amazon", "paris"] as const) {
    if (process.argv.includes("--paris-only") && boardId !== "paris") continue;
    const baseline = plan.boards.find((b: { board: string }) => b.board === boardId);
    if (!baseline) throw new Error(`Missing ${boardId} final review baseline`);
    const spec = read(baseline.spec), catalog = read(spec.catalogPath), board = catalog.boards.find((b: { boardId: string }) => b.boardId === boardId);
    if (!board || board.slots.length !== 3) throw new Error("Expected three authored appearances");
    const revision = boardId === "paris" ? "local-tone-v3" : "local-tone-v1";
    const out = `work/open-placement-20260909/${boardId}-${revision}`; mkdirSync(out, { recursive: true });
    const adjustments = [];
    for (let i = 0; i < 3; i++) {
      const direction = board.slots[i], previousPath = direction.placement.priorResultMetadata.path, previousBytes = readFileSync(previousPath);
      const previous = JSON.parse(previousBytes.toString("utf8")), priorSlot = structuredClone(previous.slot), slot = structuredClone(priorSlot);
      const [exposureStops, saturation] = grades[boardId][i]!;
      slot.compositingTone = { version: "local-exposure-chroma/v1", exposureStops, saturation };
      // Bakery 20% scale probe in local-tone-v2 passed geometry but exposed a
      // lower-body sliver beyond the retained bread foreground. Keep original
      // geometry here, and retain the measured scale concern for human review.
      const priorReviewPath = `${baseline.run}/visual-review-final-world-v4/slot-${i + 1}.json`, priorReview = read(priorReviewPath);
      const meta = { slot, boardSha256: board.staticArt.sha256, foregroundSha256: direction.placement.foreground.sha256,
        semanticStatus: "pending", automaticRelease: false,
        authoring: { version: "bounded-local-tone-review/v1", paidCalls: 0, originalPaidSourceAndObservationsUnchanged: true,
          originalForegroundUnchanged: true, protectedRegionsUnchanged: true, rawAlphaUnchanged: true,
          basis: boardId === "amazon" ? "Whole-child exposure and chroma lowered to shaded canopy/porch people. No face, hair or skin-specific manipulation; source identity and smoothness are not repaired or approved."
            : i === 1 ? "Modest whole-child chroma/exposure reduction on the naturally sunlit balcony. No invented wall shadow; uncertain same-depth scale remains a review flag."
              : i === 0 ? "Bakery amber shade whole-child tone only. Original scale retained: the single 20% enlargement test exposed lower body beyond the original mask, so that geometry is not carried. Scale and age concerns remain open."
                : "Whole-child exposure/chroma matched to existing foreground building shade. No fake cast/contact shadow added.",
          previousVisualReview: { path: priorReviewPath, sha256: sha256Bytes(readFileSync(priorReviewPath)), checks: priorReview.checks, reason: priorReview.reason },
          retainedLimits: boardId === "amazon" && i === 1 ? ["Prior identity fail and age uncertainty remain unresolved by tone"]
            : boardId === "paris" && i === 0 ? ["Prior relativeScale fail around0.6 and ageProportions fail remain unresolved", "Do not use superseded local-tone-v2 enlargement proof"]
            : boardId === "paris" && i === 1 ? ["No same-depth child comparator in balcony crop", "No new child wall cast shadow"]
              : ["Source illustration smoothness is unchanged", "New exact composite has not been semantically approved"] },
        revision: { id: revision, baselineSpec: baseline.spec, originalSourceSpec: baseline.source,
          priorContract: { path: previousPath, sha256: sha256Bytes(previousBytes) }, priorSlot } };
      const metadataPath = `${out}/${slot.id}.json`, metadataBytes = Buffer.from(JSON.stringify(meta, null, 2));
      writeImmutableBytes(metadataPath, metadataBytes);
      direction.placement.contract = { path: metadataPath, sha256: sha256Bytes(metadataBytes) };
      direction.placement.priorResultMetadata = direction.placement.contract;
      direction.placement.eyeAnchorPx = slot.eye;
      direction.placement.eyeToChinPx = slot.faceHeightPx; direction.placement.modifiedByThisCatalog = true;
      adjustments.push({ slot: i + 1, slotId: slot.id, priorSlot, revisedSlot: slot, priorChecks: priorReview.checks });
    }
    catalog.revision = { id: `${boardId}-${revision}`, baselineSpec: baseline.spec, paidCalls: 0, semanticStatus: "pending" };
    const catalogPath = `${out}/catalog.json`; writeImmutableBytes(catalogPath, JSON.stringify(catalog, null, 2));
    const destination = { ...spec, catalogPath }; writeImmutableBytes(`${out}/spec.json`, JSON.stringify(destination, null, 2));
    await loadBoardConditioningInputs(destination);
    writeImmutableBytes(`${out}/adjustments.json`, JSON.stringify({ boardId, baselineReviewPlan: planPath, baselineSpec: baseline.spec,
      originalSourceSpec: baseline.source, adjustments, newApiCalls: 0, sourcePixelsEdited: false, semanticStatus: "pending", automaticRelease: false }, null, 2));
    console.log(JSON.stringify({ boardId, spec: `${out}/spec.json`, loader: "passed", newApiCalls: 0 }));
  }
}
main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
