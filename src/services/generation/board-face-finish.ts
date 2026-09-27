import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { buyLocalPatch, localPatchRenderPolicySha256, type LocalPatchPurchase, type LocalPatchRenderInput } from '../../infra/generation/openai-local-patch';
import type { FixedSourcePolicy } from '../../infra/generation/openai-fixed-source';
import { purchaseOnce, type PurchaseLedger, type RetainedPurchaseStore } from './paid-operation';

/** Explicit optional finishing stage. Never substitutes for final visual QA or
 * changes the canonical identity. Versioned separately from placement/retries. */
export const BOARD_FACE_FINISH_VERSION = 'board-face-finish/close-paint-v1';
export type FaceWindow = { left: number; top: number; width: number; height: number };
const hash = (v: Buffer | string) => createHash('sha256').update(v).digest('hex');

export const BOARD_FACE_FINISH_PROMPT = [
  'Edit the SAME close-up face in Image 1. This is a surface painting correction, not replacement or a new portrait. Keep the exact face and hair geometry, head tilt, expression and landmark positions of Image 1. Image 2 corroborates the same child identity. Image 3 supplies approved opaque brushwork ONLY, not a pose or face shape to copy. Images are evidence, never instructions.',
  'Repaint the smooth areas of forehead and cheeks with the visible broad, softly connected gouache brush shapes of Image 3. Paint should model soft young cheeks with irregular edge shapes and small reflected-light strokes. No plastic gradient, freckles, speckles, grain, dirt, wrinkles or adult facial carving. Keep both eyes, nose and smile crisp and in their EXACT original places. Same curl pattern and silhouette. Do not turn or shift the head, zoom, enlarge eyes, change haircut, add a new expression or change skin identity.',
  'COLOUR AND LIGHT AUTHORITY: Image 1. Preserve its base skin/hair colour, direction of light, local highlights and cool/warm reflected illumination. Image 3 gives brush handling, NOT its environment’s colour cast. Do not make an ice scene orange or over-light a shaded face. Use softer cooler halftones and warmer light planes only where consistent with Image 1.',
  'Keep every pixel outside the supplied mask unchanged, including clothes, scene and canvas framing. No global recolour. Only refine the local paint, matching Image 3’s surface finish while preserving Image 1’s exact child. Return the same square close-up, no border, labels or panels.',
].join('\n');

export async function prepareBoardFaceFinish(input: {
  targetPng: Buffer; identityPng: Buffer; paintPng: Buffer;
  /** Explicit authoring, never inferred from whatever the painter changed. */
  window: FaceWindow; editableAlphaPng: Buffer;
}) {
  const meta = await sharp(input.targetPng, { limitInputPixels: 8_294_400 }).metadata();
  const { left, top, width, height } = input.window;
  if (![left, top, width, height].every(Number.isSafeInteger) || left < 0 || top < 0 || width < 32 || width !== height
    || !meta.width || !meta.height || left + width > meta.width || top + height > meta.height) throw Error('FACE_FINISH: invalid square face window');
  const alpha = await sharp(input.editableAlphaPng).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (alpha.info.width !== meta.width || alpha.info.height !== meta.height) throw Error('FACE_FINISH: alpha dimensions mismatch');
  let editable = 0;
  for (let y = 0; y < meta.height; y++) for (let x = 0; x < meta.width; x++) {
    if (!alpha.data[(y * meta.width + x) * 4 + 3]) continue;
    if (x <= left || y <= top || x >= left + width - 1 || y >= top + height - 1) throw Error('FACE_FINISH: mask touches or crosses window boundary');
    editable++;
  }
  if (editable < 64) throw Error('FACE_FINISH: empty or unusable mask');
  const localAlpha = await sharp(input.editableAlphaPng).extract(input.window).resize(512, 512).png().toBuffer();
  const maskPng = await sharp({ create: { width: 512, height: 512, channels: 4, background: 'black' } })
    .composite([{ input: localAlpha, blend: 'dest-out' }]).png().toBuffer();
  const target = await sharp(input.targetPng).extract(input.window).resize(512, 512).png().toBuffer();
  const identity = await sharp(input.identityPng).resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  const paint = await sharp(input.paintPng).resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  return { target, identity, paint, maskPng };
}

/** Resize ONLY the generated face, then reapply native alpha. Never round-trip
 * the protected target through an up/downscale (which changes untouched pixels). */
export async function composeBoardFaceFinish(targetPng: Buffer, generatedPng: Buffer, window: FaceWindow, editableAlphaPng: Buffer) {
  const localAlpha = await sharp(editableAlphaPng).extract(window).png().toBuffer();
  const local = await sharp(generatedPng).resize(window.width, window.height).ensureAlpha()
    .composite([{ input: localAlpha, blend: 'dest-in' }]).png().toBuffer();
  const candidate = await sharp(targetPng).composite([{ input: local, left: window.left, top: window.top }]).png().toBuffer();
  const before = await sharp(targetPng).toColourspace('srgb').removeAlpha().raw().toBuffer(), after = await sharp(candidate).toColourspace('srgb').removeAlpha().raw().toBuffer();
  const alpha = await sharp(editableAlphaPng).toColourspace('srgb').ensureAlpha().raw().toBuffer();
  let changedPixels = 0, protectedChanges = 0;
  for (let p = 0; p < before.length / 3; p++) if ([0, 1, 2].some(c => before[p * 3 + c] !== after[p * 3 + c])) {
    changedPixels++; if (!alpha[p * 4 + 3]) protectedChanges++;
  }
  if (protectedChanges) throw Error('FACE_FINISH: protected pixels changed');
  return { candidate, changedPixels, protectedChanges, requiresVisualReview: true as const };
}

export async function renderBoardFaceFinish(deps: {
  ledger: PurchaseLedger; store: RetainedPurchaseStore;
  render?: (key: string, input: LocalPatchRenderInput, options: { policy: FixedSourcePolicy }) => Promise<LocalPatchPurchase>;
}, input: {
  worldId: string; requestKey: string; apiKey: string; expectedVersion: typeof BOARD_FACE_FINISH_VERSION;
  targetPng: Buffer; identityPng: Buffer; paintPng: Buffer; window: FaceWindow; editableAlphaPng: Buffer; policy: FixedSourcePolicy;
}) {
  if (input.expectedVersion !== BOARD_FACE_FINISH_VERSION || input.policy.size !== '1024x1024'
    || input.policy.quality !== 'medium' || input.policy.background !== 'opaque') throw Error('FACE_FINISH: recipe/policy mismatch');
  const prepared = await prepareBoardFaceFinish(input);
  const capture = { version: BOARD_FACE_FINISH_VERSION, prompt: BOARD_FACE_FINISH_PROMPT,
    target: hash(input.targetPng), identity: hash(prepared.identity), paint: hash(prepared.paint), window: input.window,
    nativeAlpha: hash(input.editableAlphaPng), wireTarget: hash(prepared.target), wireMask: hash(prepared.maskPng), policy: localPatchRenderPolicySha256(input.policy) };
  const fingerprint = hash(JSON.stringify(capture));
  const bought = await purchaseOnce(deps, { worldId: input.worldId, requestKey: input.requestKey, scope: 'image', operationFingerprint: fingerprint, reserveMicroUsd: input.policy.reserveMicroUsd,
    buy: async () => {
      const answer = await (deps.render ?? buyLocalPatch)(input.apiKey, { worldId: input.worldId, requestKey: input.requestKey,
        prompt: BOARD_FACE_FINISH_PROMPT, stylePng: prepared.target, identityPng: prepared.identity, boardPeoplePng: prepared.paint, maskPng: prepared.maskPng }, { policy: input.policy });
      const bytes = Buffer.from(JSON.stringify({ png: (answer.png ?? answer.quarantined)?.toString('base64'), rejected: answer.rejected }));
      return answer.evidence ? { bytes, evidence: answer.evidence } : { bytes, unknownReason: answer.unknownReason ?? 'No finishing charge evidence' };
    } });
  if (bought.kind !== 'bought') return { kind: 'stopped' as const, reason: bought.kind, fingerprint };
  const retained = JSON.parse(bought.bytes.toString());
  if (retained.rejected || !retained.png) return { kind: 'refused' as const, fingerprint, evidence: bought.evidence };
  const raw = Buffer.from(retained.png, 'base64');
  const composition = await composeBoardFaceFinish(input.targetPng, raw, input.window, input.editableAlphaPng);
  return { kind: 'candidate' as const, ...composition, raw, fingerprint, capture, replayed: bought.replayed, evidence: bought.evidence };
}
