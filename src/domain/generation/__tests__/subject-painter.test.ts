import { describe, expect, it } from "vitest";
import { localPatchBoardsForVersion } from "../../scene/local-patch-catalog";
import { subjectPlanCanonical, subjectPlanFor, subjectRenderDirection } from "../subject-policy";
import { SUBJECT_PAINTER_V2, subjectRenderDirectionV2, subjectSupportPose } from "../subject-painter";
import { localPatchPrompt, LOCAL_PATCH_POSE_WORDING } from "../../../services/generation/local-patch-prompt";
import { maskForHide } from "../../scene/local-patch-hides";
import { selfRepairRenderInstructions, type SelfRepairDecision } from "../../scene/local-patch-self-repair";

describe("the v2 subject painter removes contradictory arms while preserving the plan and support", () => {
  it("builds each complete v12 painter request without the old arms instruction", () => {
    for (const board of localPatchBoardsForVersion(12)) for (const hide of board.hides) {
      const input = { ground: board.ground, pose: hide.pose, ageYears: 7, wardrobe: hide.wardrobe ?? board.wardrobe, placement: hide.placement,
        mask: maskForHide(hide), contentVersion: 12, hideId: hide.id, paintRecipe: "scene-integration-v8" as const };
      const legacy = localPatchPrompt(input), revised = localPatchPrompt({ ...input, subjectPainter: SUBJECT_PAINTER_V2 });
      expect(legacy).toContain(LOCAL_PATCH_POSE_WORDING[hide.pose].instruction);
      expect(revised).toContain(subjectSupportPose(hide.pose));
      expect(revised).not.toContain("arms relaxed at their sides or one hand holding the other");
      expect(revised).toContain("SUPPORT:");
      expect(revised.includes("FIXED SCENERY:")).toBe(legacy.includes("FIXED SCENERY:"));
      const plan = subjectPlanFor(board, hide.id), before = subjectPlanCanonical(plan), text = subjectRenderDirectionV2(plan, 7, ["plannedAction", "plannedHead", "plannedExpression"]);
      expect(text).toContain(plan.action); expect(text).toContain(plan.gaze); expect(text).toContain(plan.expression);
      expect(text).toContain("ACTION REPAIR: visibly draw");
      expect(subjectPlanCanonical(plan)).toBe(before);
      expect(subjectRenderDirection(plan, 7)).not.toContain(SUBJECT_PAINTER_V2);
    }
  });
  it("allows a diagnosed subject redraw to change the faulty pose without moving support", () => {
    const decision: SelfRepairDecision = { cause: "drawing-defect", explanation: "Synthetic arms remain at the sides.", action: "redraw-with-new-placement", sourceKey: "synthetic",
      returnWindow: { left: 1, top: 1, width: 510, height: 766 }, protectedCore: { left: 40, top: 80, width: 300, height: 600 }, faceRect: { left: 80, top: 100, width: 70, height: 80 } };
    expect(selfRepairRenderInstructions(decision)).toContain("Do not change the canonical identity, pose, authored depth or support");
    const revised = selfRepairRenderInstructions(decision, true);
    expect(revised).not.toContain("Do not change the canonical identity, pose");
    expect(revised).toContain("correct arms, head and expression to the SUBJECT PLAN");
    expect(revised).toContain("authored depth and support");
  });
});
