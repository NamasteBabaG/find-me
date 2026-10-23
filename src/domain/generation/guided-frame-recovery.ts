import { z } from 'zod';
import { SINGLE_VISUAL_REVIEW_VERSION, readSingleVisualReview } from './single-visual-review';

/** One prospective, bounded painting after exhausted repairs; never another image approval. */
export const GUIDED_FRAME_RECOVERY_VERSION = 'single-low-guided-frame-recovery/v1' as const;
export const GUIDED_FRAME_MIN_CAPACITY_MICRO_USD = 370_000;
export type GuideRect = { left: number; top: number; width: number; height: number };
export type GuidedFrameRow = { status: string; attempts: number; assetId?: string | null; judgeJson: string | null };
export type GuidedFrameMarker = { version: typeof GUIDED_FRAME_RECOVERY_VERSION; authorizationSha256: string;
  sourceImageSha256: string; sourceAssetId: string; sourceReviewRequestKey: string; originalAttempts: 2; repairCyclesPreserved: number };
const object = (v: unknown): Record<string, unknown> | null => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const boundedId = z.string().min(1).max(240).regex(/^[A-Za-z0-9_:.-]+$/);
const markerSchema = z.object({ version:z.literal(GUIDED_FRAME_RECOVERY_VERSION),authorizationSha256:z.string().regex(/^[a-f0-9]{64}$/),
  sourceImageSha256:z.string().regex(/^[a-f0-9]{64}$/),sourceAssetId:boundedId,sourceReviewRequestKey:boundedId,
  originalAttempts:z.literal(2),repairCyclesPreserved:z.literal(3) }).strict();
function receipt(row: GuidedFrameRow) { try { return object(JSON.parse(row.judgeJson ?? 'null')); } catch { return null; } }
export function parseGuidedFrameMarker(value: unknown): GuidedFrameMarker | null { const parsed=markerSchema.safeParse(value); return parsed.success ? parsed.data : null; }
export function guidedFrameMarker(row: GuidedFrameRow): GuidedFrameMarker | null { return parseGuidedFrameMarker(receipt(row)?.guidedFrameRecovery); }
/** Scheduling only: the service verifies the actual one-world authority and the renderer enforces the unchanged source/window. */
export function guidedFrameCandidate(row: GuidedFrameRow): boolean {
  const r=receipt(row), repair=object(r?.selfRepair);
  if (!r || repair?.version !== 'local-patch-self-repair/v1' || repair.subjectV2Cycles !== 3) return false;
  if (row.status === 'PENDING' && row.attempts === 3) return !!guidedFrameMarker(row);
  if (row.status !== 'FAILED' || row.attempts !== 2 || !row.assetId || guidedFrameMarker(row)
    || r.reviewState !== 'board-review-complete' || r.wireFault !== null || !hash(r.judgedSha256)) return false;
  const dual=object(object(r.boardReview)?.dual), q=object(dual?.quality), policy=object(q?.policy), verdict=object(r.verdict);
  const outer=typeof q?.raw === 'string' ? readSingleVisualReview(q.raw) : null, boundaries=object(verdict?.boundaryIntegrity);
  return dual?.single === SINGLE_VISUAL_REVIEW_VERSION && policy?.effort === 'low' && policy.model === 'gpt-6.1-sol'
    && typeof q?.requestKey === 'string' && !!outer && outer.doubt === false && verdict?.verdict === 'fail'
    && ['childComplete','pictureWhole','severeSeam','neighborsIntact'].some(k=>verdict[k] === 'fail')
    && ['left','top','right','bottom'].some(k=>object(boundaries?.[k])?.status === 'fail');
}
export function newGuidedFrameMarker(row: GuidedFrameRow, authorizationSha256: string): GuidedFrameMarker {
  if (!hash(authorizationSha256) || row.status !== 'FAILED' || !guidedFrameCandidate(row)) throw Error('GUIDED_FRAME: conclusive current LOW failure and exhausted repair history required');
  const r=receipt(row)!, q=object(object(object(r.boardReview)?.dual)?.quality)!;
  return markerSchema.parse({version:GUIDED_FRAME_RECOVERY_VERSION,authorizationSha256,sourceImageSha256:r.judgedSha256,
    sourceAssetId:row.assetId,sourceReviewRequestKey:q.requestKey,originalAttempts:2,repairCyclesPreserved:3});
}
function valid(r: GuideRect) { return [r.left,r.top,r.width,r.height].every(Number.isSafeInteger) && r.left >= 0 && r.top >= 0 && r.width > 0 && r.height > 0 && r.left+r.width <= 512 && r.top+r.height <= 768; }
export function guidedFrameGeometry(child: GuideRect, returned: GuideRect) {
  if (!valid(child) || !valid(returned) || child.left < returned.left || child.top < returned.top
    || child.left+child.width > returned.left+returned.width || child.top+child.height > returned.top+returned.height)
    throw Error('GUIDED_FRAME: guide cannot expand the authored child or returned window');
  const side = Math.max(1,Math.round(child.width*0.06)), top = Math.max(1,Math.round(child.height*0.10));
  const target = { left:child.left+side, top:child.top+top, width:child.width-2*side, height:child.height-top };
  if (target.width < 30 || target.height < 60) throw Error('GUIDED_FRAME: insufficient visible target room');
  return { version: GUIDED_FRAME_RECOVERY_VERSION, child: { ...child }, returned: { ...returned }, target };
}
export function guidedFrameOverlay(child: GuideRect, returned: GuideRect): string {
  const { target:t } = guidedFrameGeometry(child,returned);
  return '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="768" viewBox="0 0 512 768">'
    + '<rect x="'+returned.left+'" y="'+returned.top+'" width="'+returned.width+'" height="'+returned.height+'" fill="none" stroke="#ffb020" stroke-width="2" stroke-dasharray="6 4"/>'
    + '<rect x="'+t.left+'" y="'+t.top+'" width="'+t.width+'" height="'+t.height+'" fill="#00b8ff" fill-opacity="0.13" stroke="#00b8ff" stroke-width="3"/>'
    + '<text x="'+t.left+'" y="'+Math.max(12,t.top-7)+'" fill="#003b55" stroke="white" stroke-width="2" paint-order="stroke" font-family="sans-serif" font-size="11" font-weight="bold">WHOLE TARGET INSIDE</text></svg>';
}
export function guidedFrameDirections(child: GuideRect, returned: GuideRect): string {
  const g=guidedFrameGeometry(child,returned);
  return 'GEOMETRY GUIDE '+GUIDED_FRAME_RECOVERY_VERSION+'. The LAST reference is a marked copy of this SAME original 512x768 crop, used for position only. Edit the FIRST original image. Orange marks the unchanged maximum return window '+JSON.stringify(g.returned)+'. Cyan marks the safe whole-target frame '+JSON.stringify(g.target)+'. '
    + 'Draw the complete visible crown, hair/hat, head, torso and naturally visible limbs INSIDE cyan. Preserve the stated age and proportions, pose, depth, support and natural occlusion; do not make the child younger to fit. The whole cyan frame is a maximum, not an instruction to fill it. The editor mask covers the orange context so surrounding scenery can be reconstructed coherently, but the child must stay inside cyan. '
    + 'People continuing outside orange must remain whole at their original coordinates. No guide colour, text, outline, box or marker may appear in the final art. Never crop a head to fit the frame; paint it at the correct location before returning the final unmarked source-sized crop.';
}
