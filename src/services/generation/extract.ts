import type { AvatarProvider, SlotMatteResponse } from "@/infra/generation/types";
import { diffToPatch, matteToPatch, occluderShift, paintMask, EXTRACTION_VERSION, MATTE_VERSION, type PatchResult, type Size, type SlotContext, type SlotPoint } from "./patch";
import { fitMatte } from "@/infra/generation/openai";

/**
 * How the child comes out of a render.
 *
 * One truth for the harness and the pipeline: both call this, so what a
 * sample shows is what a game ships. A provider that can matte its own
 * render (pass two) is asked to; the colour difference is the fallback for
 * one that cannot, and the free first look for both — a render that changed
 * nothing is rejected before pass two spends anything on it.
 *
 * Pass two is checked, not trusted. A matte that is mostly what the board
 * already had (a bystander, the occluder) is an extraction failure: pass two
 * is asked again once, told what it got wrong, on the same render — the
 * render was fine and is not bought again. A render that moved the occluder
 * a peek was authored against is a render failure, and pass two is not
 * spent on it at all.
 */
export interface ExtractInput {
  provider: Pick<AvatarProvider, "matteSlotCrop">;
  originalCrop: Buffer;
  editedCrop: Buffer;
  ctx: SlotContext;
  art: Size;
  slot: SlotPoint;
  /** Which figure is the child (matteHint). */
  hint: string;
  label: string;
  quality?: string;
  reference?: Buffer;
  /** Budget/storage checkpoint, immediately after EACH paid answer, before processing or another call. */
  onMatte?: (matte: SlotMatteResponse) => Promise<void>;
  /** Remaining paid attempts for this render, across resumed ticks. */
  maxNewMatteAttempts?: number;
  /** Absolute time by which everything must be done; pass two is deferred when there is not `minPassTwoMs` left. */
  deadlineAt?: number;
  minPassTwoMs?: number;
  /** A saved pass-two answer (the model's raw output) to key instead of buying one: a resumed attempt. */
  priorMatte?: Buffer;
}

export interface Extraction {
  patch: PatchResult;
  method: "matte" | "diff" | "deferred";
  /** The version of the extraction that made the patch, for the ledger. */
  version: string;
  /** Pass two's last answer and its bill, when one was made. */
  matte?: SlotMatteResponse;
  /** Every pass-two answer of this extraction, first to last; each one was paid for. */
  matteAttempts: SlotMatteResponse[];
  /** What the colour difference saw, kept for the record either way. */
  diff: Pick<PatchResult, "largest" | "painted" | "shape">;
  /** Set when the render itself was refused (the occluder moved): nothing was cut out. */
  renderProblem?: string;
  /** Set when pass two could not produce the child; the render was fine. */
  extractionProblem?: string;
  /** The occluder check, when the slot has a polygon. */
  occluder?: { mean: number; pixels: number };
}

/**
 * Above this, the silhouette is mostly something the board already had.
 * Measured 7 September: real children on varied ground 1–15%; a pale child
 * against a pale wall or basket 29–30% (giza/stones, paris/bakery at medium:
 * a white dress over sandstone is "unchanged" pixel by pixel and she is new);
 * kept bystanders and scenery 45–64%. The limit sits in the gap above the
 * pale cases, not below them.
 */
export const UNCHANGED_LIMIT = 0.4;
/**
 * The occluder numbers (occluderShift, occluderGap) are recorded on every
 * attempt and do not reject. Three measures were tried on the renders on
 * disk against the one raised bench (newyork/bench, proof-1) — the colour
 * distance inside the polygon (76 raised vs 80 kept), the cut line's height
 * above the polygon's top (58% raised vs 29% kept, but 69% on a correct peek
 * over the ice ledge), the nearest strong board edge below the cut line (10
 * px in both) — and none separates it from kept occluders with the planning
 * run's approximate polygons. The defence against a moved occluder is the
 * paint mask that leaves the polygon out, the prompt ("stays exactly where and
 * as it is"), the matte clipped by the polygon, and the judge on the board;
 * the numbers are kept so a limit can be set once there are more cases.
 */
const PASS_TWO_TRIES = 2;
const DEFAULT_MIN_PASS_TWO_MS = 45_000;

export async function extractChild(input: ExtractInput): Promise<Extraction> {
  const { originalCrop, editedCrop, ctx, art, slot } = input;
  const diff = await diffToPatch({ originalCrop, editedCrop, ctx, art, slot });
  const seen = { largest: diff.largest, painted: diff.painted, shape: diff.shape };
  const none = (method: Extraction["method"], version: string, extra: Partial<Extraction> = {}): Extraction => ({ patch: diff, method, version, matteAttempts: [], diff: seen, ...extra });
  if (diff.largest === 0 || !input.provider.matteSlotCrop) return none("diff", EXTRACTION_VERSION);

  // How much the render re-shaded the occluder: recorded, not judged — a raised
  // bench and a kept one measured the same (76 vs 80); the cut line below tells them apart.
  const occluder = (await occluderShift({ originalCrop, editedCrop, ctx, art, slot })) ?? undefined;

  const mask = paintMask(ctx, art, slot);
  const attempts: SlotMatteResponse[] = [];
  let problem: string | undefined;
  const newLimit = input.maxNewMatteAttempts ?? PASS_TWO_TRIES;
  for (let n = 0; n < newLimit + (input.priorMatte ? 1 : 0); n++) {
    let matte: SlotMatteResponse;
    if (n === 0 && input.priorMatte) {
      // A resumed attempt: the answer was paid for in an earlier slice.
      const meta = await import("sharp").then((m) => m.default(editedCrop).metadata());
      let png: Buffer;
      try {
        png = await fitMatte(input.priorMatte, meta.width ?? ctx.rect.w, meta.height ?? ctx.rect.h);
      } catch (err) {
        png = Buffer.alloc(0);
        problem = err instanceof Error ? err.message : String(err);
      }
      matte = { png, rawPng: input.priorMatte, costCents: 0, model: "resumed", durationMs: 0, attempts: 0, problem };
    } else {
      if (input.deadlineAt !== undefined && input.deadlineAt - Date.now() < (input.minPassTwoMs ?? DEFAULT_MIN_PASS_TWO_MS)) {
        return none("deferred", MATTE_VERSION, { occluder, matteAttempts: attempts, matte: attempts.at(-1) });
      }
      matte = await input.provider.matteSlotCrop({ edited: editedCrop, original: originalCrop, hint: input.hint, mask, reference: input.reference, retryHint: problem, label: input.label, quality: input.quality, deadlineAt: input.deadlineAt });
      await input.onMatte?.(matte);
    }
    attempts.push(matte);
    if (matte.costUnknown) return none("matte", MATTE_VERSION, { matte, matteAttempts: attempts, extractionProblem: "matte cost unknown; held before further calls", occluder });
    if (matte.problem) { problem = matte.problem; continue; }
    let patch: PatchResult;
    try {
      patch = await matteToPatch({ originalCrop, mattePng: matte.png, ctx, art, slot, editedCrop });
    } catch (err) {
      problem = `the answer could not be keyed: ${err instanceof Error ? err.message : String(err)}`;
      continue;
    }
    if (patch.largest === 0) { problem = "nothing was kept: the child must stay, only the rest is magenta"; continue; }
    if ((patch.unchanged ?? 0) > UNCHANGED_LIMIT) {
      problem = `${Math.round((patch.unchanged ?? 0) * 100)}% of what was kept was already in the scene before the child was added (a bystander or an object); those stay magenta`;
      continue;
    }
    return { patch, method: "matte", version: MATTE_VERSION, matte, matteAttempts: attempts, diff: seen, occluder };
  }
  return none("matte", MATTE_VERSION, { matte: attempts.at(-1), matteAttempts: attempts, occluder, extractionProblem: problem ?? "pass two was not made" });
}
