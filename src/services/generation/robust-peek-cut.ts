import sharp from "sharp";
import { composeSimplePeek, findSimplePeekCut, type SimplePeekUncutInput } from "./simple-peek";

/** Opt-in authoring/replay policy. Historical first-hidden-row cuts do not change. */
export const ROBUST_PEEK_CUT_VERSION = "two-hidden-rows-one-face-side-margin/v1";
export interface RobustPeekCandidateObservation {
  lowerCutY: number;
  covered: boolean;
  worstSideMarginPx: number | null;
  failedChecks?: string[];
}

/**
 * Select a deeper ALREADY-hidden cut, without moving the source, destination or
 * foreground. A first hidden row on a sloped mask often has only 1px of slack;
 * that is not evidence that the authored occluder lacks room farther down.
 *
 * Unlike old audit scripts that checked a single rounded board row, this checks
 * every native board pixel in the bilinear footprint of both final source rows.
 * Every such board row must contain one continuous solid foreground run around
 * the entire silhouette span plus >= one destination face-height on EACH side.
 * The unchanged compositor then revalidates every existing guard. This is an
 * additional geometric robustness measure, never anatomy/lighting approval or
 * a guarantee for all possible future silhouettes.
 */
export async function chooseRobustPeekCut(input: SimplePeekUncutInput, options: {
  minCutY: number;
  /** Optional free audit telemetry; does not participate in selection. */
  onCandidate?: (candidate: RobustPeekCandidateObservation) => void;
}) {
  // Reuse the existing input/board/mask validation and its unchanged minimum
  // face clearance. The historical function itself is deliberately untouched.
  const firstHiddenCut = await findSimplePeekCut(input, options);
  if (firstHiddenCut === null) return null;
  const [sprite, foreground] = await Promise.all([
    sharp(input.source.png, { limitInputPixels: 25_000_000 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(input.foreground.png, { limitInputPixels: 25_000_000 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  const sw = sprite.info.width, sh = sprite.info.height, bw = foreground.info.width, bh = foreground.info.height;
  const distance = Math.hypot(input.source.chin.x - input.source.eye.x, input.source.chin.y - input.source.eye.y);
  const scale = input.slot.faceHeightPx / distance;
  const tx = input.slot.eye.x - input.source.eye.x * scale, ty = input.slot.eye.y - input.source.eye.y * scale;
  const requiredMarginPx = Math.ceil(input.slot.faceHeightPx);
  const rows = Array.from({ length: sh }, (_, y) => {
    let left = sw, right = -1, strong = 0;
    for (let x = 0; x < sw; x++) {
      const alpha = sprite.data[(y * sw + x) * 4 + 3]!;
      if (alpha) { left = Math.min(left, x); right = x; }
      if (alpha >= 32) strong++;
    }
    return { left, right, strong };
  });
  const solid = (x: number, y: number) => x >= 0 && x < bw && y >= 0 && y < bh
    && foreground.data[(y * bw + x) * 4 + 3] === 255;
  let inspectedCuts = 0, composedCandidates = 0;
  for (let cut = firstHiddenCut; cut <= sh; cut++) {
    if (!rows[cut - 1]!.strong) continue;
    inspectedCuts++;
    const bands = new Map<number, { left: number; right: number }>();
    for (let y = cut - 2; y < cut; y++) {
      const row = rows[y]!;
      if (row.right < row.left) continue;
      const left = Math.floor(tx + (row.left - .5) * scale), right = Math.ceil(tx + (row.right + 1.5) * scale) - 1;
      for (let by = Math.floor(ty + (y - .5) * scale); by < Math.ceil(ty + (y + 1.5) * scale); by++) {
        const previous = bands.get(by);
        bands.set(by, { left: Math.min(previous?.left ?? left, left), right: Math.max(previous?.right ?? right, right) });
      }
    }
    let leftMarginPx = Infinity, rightMarginPx = Infinity, covered = bands.size > 0;
    for (const [y, band] of bands) {
      if (y < 0 || y >= bh || band.left < 0 || band.right >= bw) { covered = false; break; }
      for (let x = band.left; x <= band.right; x++) if (!solid(x, y)) { covered = false; break; }
      if (!covered) break;
      let left = 0, right = 0;
      while (solid(band.left - left - 1, y)) left++;
      while (solid(band.right + right + 1, y)) right++;
      leftMarginPx = Math.min(leftMarginPx, left); rightMarginPx = Math.min(rightMarginPx, right);
    }
    const worstSideMarginPx = covered ? Math.min(leftMarginPx, rightMarginPx) : null;
    options.onCandidate?.({ lowerCutY: cut, covered, worstSideMarginPx });
    if (!covered || Math.min(leftMarginPx, rightMarginPx) < requiredMarginPx) continue;
    composedCandidates++;
    const composite = await composeSimplePeek({ ...input, source: { ...input.source, lowerCutY: cut } });
    if (!composite.ok) {
      options.onCandidate?.({ lowerCutY: cut, covered, worstSideMarginPx,
        failedChecks: Object.entries(composite.checks).filter(([, passed]) => !passed).map(([key]) => key) });
      // Adding lower source rows cannot repair a face/frame defect or erase
      // already-visible pixels outside the board/window or inside a forbidden
      // feature. Avoid hundreds of identical full-board renders for that case.
      const permanent = ["sourceFaceOpaque", "protectedFaceVisible", "onlyLowerEdgeTruncated",
        "withinBoard", "withinFrozenWindow", "forbiddenRegionsClear"] as const;
      if (permanent.some(key => !composite.checks[key])) return null;
      continue;
    }
    return { version: ROBUST_PEEK_CUT_VERSION, lowerCutY: cut, firstHiddenCut,
      margin: { requiredMarginPx, leftMarginPx, rightMarginPx, worstSideMarginPx: Math.min(leftMarginPx, rightMarginPx),
        coveredNativeRows: bands.size, policy: "continuous-255-alpha-run-over-both-source-row-footprints" as const },
      inspectedCuts, composedCandidates, composite, semanticStatus: "pending" as const, automaticRelease: false as const };
  }
  return null;
}

/** Geometry-only source-blind authoring audit. Source names/bytes remain intact. */
export async function auditRobustPeekSources(input: Omit<SimplePeekUncutInput, "source"> & {
  sources: { id: string; source: SimplePeekUncutInput["source"] }[];
}) {
  if (!input.sources.length || new Set(input.sources.map(s => s.id)).size !== input.sources.length) throw new Error("ROBUST_PEEK: unique nonempty source inventory required");
  const results = [];
  for (const item of input.sources) {
    const face = Math.hypot(item.source.chin.x - item.source.eye.x, item.source.chin.y - item.source.eye.y);
    const selected = await chooseRobustPeekCut({ board: input.board, foreground: input.foreground, slot: input.slot, source: item.source },
      { minCutY: Math.ceil(item.source.chin.y + face) });
    results.push({ sourceId: item.id, sourceSha256: item.source.sha256, passed: selected !== null,
      lowerCutY: selected?.lowerCutY ?? null, firstHiddenCut: selected?.firstHiddenCut ?? null, margin: selected?.margin ?? null });
  }
  return { version: ROBUST_PEEK_CUT_VERSION, sourceCount: input.sources.length,
    passed: results.every(r => r.passed), results, semanticStatus: "pending" as const, automaticRelease: false as const };
}
