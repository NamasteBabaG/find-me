import { z } from "zod";

const bodyCaseSchema = z.object({
  id: z.string().min(1),
  state: z.enum(["coherent", "absent", "broken", "unsure"]),
  visibleBody: z.boolean(),
  headConnection: z.enum(["connected", "naturally-occluded", "missing", "merged", "none", "unsure"]),
  headTrace: z.string().min(12).max(600),
  bodyTrace: z.string().min(12).max(600),
  occlusion: z.string().max(600),
  faults: z.array(z.object({
    kind: z.enum(["missing-head", "merged-face", "disconnected-limb", "impossible-occlusion", "hard-cut", "other-anatomy"]),
    where: z.string().min(8).max(400),
  }).strict()).max(8),
}).strict();
const bodyReportSchema = z.object({ cases: z.array(bodyCaseSchema).min(1).max(12) }).strict();
export type LocalPatchBodyContinuityCase = z.infer<typeof bodyCaseSchema>;

/** A located contradiction is retained as a defect; missing cases never pass. */
export function parseLocalPatchBodyContinuity(raw: unknown, requiredIds: readonly string[]) {
  const parsed = bodyReportSchema.safeParse(raw);
  if (!parsed.success || requiredIds.length === 0 || new Set(requiredIds).size !== requiredIds.length
    || parsed.data.cases.length !== requiredIds.length || new Set(parsed.data.cases.map(c => c.id)).size !== requiredIds.length
    || parsed.data.cases.some(c => !requiredIds.includes(c.id))) return null;
  return parsed.data.cases;
}

export function localPatchBodyContinuityDisposition(cases: readonly LocalPatchBodyContinuityCase[] | null): "pass" | "repair" | "unresolved" {
  if (!cases?.length) return "unresolved";
  if (cases.some(c => c.state === "broken" || c.faults.length > 0 || c.visibleBody && ["missing", "merged", "none"].includes(c.headConnection)
    || c.state === "absent" && c.visibleBody || c.state === "coherent" && !c.visibleBody)) return "repair";
  if (cases.some(c => c.state === "unsure" || c.headConnection === "unsure"
    || c.state === "coherent" && !(c.headConnection === "connected" || c.headConnection === "naturally-occluded" && c.occlusion.trim().length >= 20)
    || c.state === "absent" && c.headConnection !== "none")) return "unresolved";
  return "pass";
}
